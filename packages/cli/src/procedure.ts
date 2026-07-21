import {
  isErr,
  isOk,
  type Result,
  type ResultError,
} from "@alt-stack/result";
import { cliNodeBrand, cliNodeKinds } from "./brand.js";
import { assertPlainContext } from "./context.js";
import type {
  AnyArgumentDescriptor,
  AnyOptionDescriptor,
  ArgumentMap,
  InferDescriptorMap,
  OptionMap,
} from "./descriptors.js";
import { optionNameFromKey } from "./descriptors.js";
import { CliDefinitionError } from "./errors.js";
import {
  isMiddlewareResult,
  middlewareResult,
  type MiddlewareFunction,
  type MiddlewareNext,
  type MiddlewareResult,
  type Overwrite,
  type RuntimeMiddleware,
} from "./middleware.js";

type MergeMaps<TBase, TNext> = Omit<TBase, keyof TNext> & TNext;

function lazyPromise<TValue>(factory: () => Promise<TValue>): Promise<TValue> {
  let activePromise: Promise<TValue> | undefined;
  const getPromise = (): Promise<TValue> => {
    activePromise ??= factory();
    return activePromise;
  };

  return {
    // eslint-disable-next-line unicorn/no-thenable -- Defers downstream execution until middleware awaits or returns next().
    then<TResult1 = TValue, TResult2 = never>(
      onfulfilled?: ((value: TValue) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return getPromise().then(onfulfilled, onrejected);
    },
    catch<TResult = never>(
      onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
    ): Promise<TValue | TResult> {
      return getPromise().catch(onrejected);
    },
    finally(onfinally?: (() => void) | null): Promise<TValue> {
      return getPromise().finally(onfinally);
    },
    [Symbol.toStringTag]: "Promise",
  };
}

export type CommandInput<
  TArguments extends ArgumentMap,
  TOptions extends OptionMap,
> = {
  args: InferDescriptorMap<TArguments>;
  options: InferDescriptorMap<TOptions>;
};

export type CommandHandler<
  TContext extends object,
  TArguments extends ArgumentMap,
  TOptions extends OptionMap,
  TValue,
  TError extends ResultError,
> = (options: {
  input: CommandInput<TArguments, TOptions>;
  ctx: TContext;
}) => Result<TValue, TError> | Promise<Result<TValue, TError>>;

type RuntimeHandler = (
  input: CommandInput<ArgumentMap, OptionMap>,
  context: object,
) => Promise<Result<unknown, ResultError>>;

const emptyArguments = Object.freeze({}) as ArgumentMap;
const emptyOptions = Object.freeze({}) as OptionMap;

function assertNoDuplicateKeys(
  current: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
  kind: "argument" | "option",
): void {
  for (const key of Object.keys(next)) {
    if (Object.hasOwn(current, key)) {
      throw new CliDefinitionError(
        kind === "argument"
          ? "invalid-argument-definition"
          : "invalid-option-definition",
        `Duplicate ${kind} key: ${key}`,
      );
    }
  }
}

function validateArguments(argumentsMap: ArgumentMap): void {
  if (Object.getOwnPropertySymbols(argumentsMap).length > 0) {
    throw new CliDefinitionError(
      "invalid-argument-definition",
      "CLI argument keys cannot be symbols",
    );
  }
  const entries = Object.entries(argumentsMap);
  let foundOptional = false;
  let foundVariadic = false;

  for (const [index, [key, descriptor]] of entries.entries()) {
    if (!key) {
      throw new CliDefinitionError(
        "invalid-argument-definition",
        "Argument keys cannot be empty",
      );
    }

    if (
      descriptor.kind !== "argument" &&
      descriptor.kind !== "variadic-argument"
    ) {
      throw new CliDefinitionError(
        "invalid-argument-definition",
        `Invalid argument descriptor for ${key}`,
      );
    }

    if (descriptor.kind === "variadic-argument") {
      if (foundVariadic || index !== entries.length - 1) {
        throw new CliDefinitionError(
          "invalid-argument-definition",
          `Variadic argument ${key} must be the only variadic argument and appear last`,
        );
      }
      foundVariadic = true;
      continue;
    }

    if (descriptor.optional) {
      foundOptional = true;
    } else if (foundOptional) {
      throw new CliDefinitionError(
        "invalid-argument-definition",
        `Required argument ${key} cannot follow an optional argument`,
      );
    }
  }
}

function validateOptions(optionsMap: OptionMap): void {
  if (Object.getOwnPropertySymbols(optionsMap).length > 0) {
    throw new CliDefinitionError(
      "invalid-option-definition",
      "CLI option keys cannot be symbols",
    );
  }
  const longNames = new Set<string>();
  const shortNames = new Set<string>();

  for (const [key, descriptor] of Object.entries(optionsMap)) {
    if (descriptor.kind !== "option" && descriptor.kind !== "flag") {
      throw new CliDefinitionError(
        "invalid-option-definition",
        `Invalid option descriptor for ${key}`,
      );
    }

    const longName = optionNameFromKey(key);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(longName)) {
      throw new CliDefinitionError(
        "invalid-option-definition",
        `Option key ${key} does not produce a valid long option name`,
      );
    }
    if (longName === "help" || longName === "version") {
      throw new CliDefinitionError(
        "invalid-option-definition",
        `Option ${key} conflicts with a built-in option`,
      );
    }
    if (longNames.has(longName)) {
      throw new CliDefinitionError(
        "invalid-option-definition",
        `Duplicate long option name: --${longName}`,
      );
    }
    longNames.add(longName);

    if (descriptor.short !== undefined) {
      if (!/^[A-Za-z0-9]$/.test(descriptor.short) || descriptor.short === "h") {
        throw new CliDefinitionError(
          "invalid-option-definition",
          `Short option for ${key} must be one alphanumeric character other than h`,
        );
      }
      if (shortNames.has(descriptor.short)) {
        throw new CliDefinitionError(
          "invalid-option-definition",
          `Duplicate short option name: -${descriptor.short}`,
        );
      }
      shortNames.add(descriptor.short);
    }
  }
}

function freezeMap<TMap extends Readonly<Record<string, unknown>>>(
  value: TMap,
): TMap {
  return Object.freeze(
    Object.assign(Object.create(null) as Record<string, unknown>, value),
  ) as TMap;
}

export class CliCommand<
  TBaseContext extends object,
  TArguments extends ArgumentMap,
  TOptions extends OptionMap,
  TValue = unknown,
> {
  readonly kind = "command" as const;
  readonly [cliNodeBrand] = cliNodeKinds.command;
  declare private readonly _contextInvariant: (
    context: TBaseContext,
  ) => TBaseContext;

  constructor(
    readonly description: string | undefined,
    readonly args: TArguments,
    readonly options: TOptions,
    private readonly middleware: readonly RuntimeMiddleware[],
    private readonly handler: RuntimeHandler,
  ) {}

  async execute(
    input: CommandInput<TArguments, TOptions>,
    context: TBaseContext,
  ): Promise<Result<TValue, ResultError>> {
    const executeAt = async (
      index: number,
      currentContext: object,
    ): Promise<Result<unknown, ResultError>> => {
      const currentMiddleware = this.middleware[index];
      if (!currentMiddleware) {
        const handlerResult = await this.handler(
          input as CommandInput<ArgumentMap, OptionMap>,
          currentContext,
        );
        if (!isOk(handlerResult) && !isErr(handlerResult)) {
          throw new TypeError("CLI command handlers must return ok(...) or err(...)");
        }
        return handlerResult;
      }

      let nextCalled = false;
      let nextResult: MiddlewareResult<object> | undefined;
      let middlewareSettled = false;
      let settledNextResult: MiddlewareResult<object> | undefined;
      let returned: Awaited<ReturnType<RuntimeMiddleware>>;

      try {
        returned = await currentMiddleware({
          ctx: currentContext,
          next: (options) => {
            if (nextCalled) {
              throw new TypeError("CLI middleware cannot call next() more than once");
            }
            nextCalled = true;

            return lazyPromise(async () => {
              await Promise.resolve();
              if (middlewareSettled) {
                if (!settledNextResult) {
                  throw new TypeError(
                    "CLI middleware cannot call next() after it has settled",
                  );
                }
                return settledNextResult;
              }

              if (options?.ctx !== undefined) {
                assertPlainContext(options.ctx, "middleware");
              }
              const nextContext = options?.ctx
                ? { ...currentContext, ...options.ctx }
                : currentContext;
              const result = await executeAt(index + 1, nextContext);
              nextResult = middlewareResult(result);
              return nextResult;
            });
          },
        });
        if (isMiddlewareResult(returned)) {
          settledNextResult = returned;
        } else if (isErr(returned)) {
          settledNextResult = middlewareResult(returned);
        }
      } finally {
        middlewareSettled = true;
      }

      if (nextCalled && returned !== nextResult) {
        throw new TypeError("CLI middleware must return the result of next()");
      }
      if (isMiddlewareResult(returned)) {
        if (!nextCalled) {
          throw new TypeError(
            "CLI middleware cannot reuse a result from another invocation",
          );
        }
        return returned.result;
      }
      if (isErr(returned)) return returned;
      throw new TypeError("CLI middleware must return next(...) or err(...)");
    };

    return (await executeAt(0, context)) as Result<TValue, ResultError>;
  }
}

export class CliProcedureBuilder<
  TBaseContext extends object,
  TCurrentContext extends object = TBaseContext,
  TArguments extends ArgumentMap = Record<never, never>,
  TOptions extends OptionMap = Record<never, never>,
> {
  constructor(
    private readonly commandDescription?: string,
    private readonly argumentDefinitions: TArguments = emptyArguments as TArguments,
    private readonly optionDefinitions: TOptions = emptyOptions as TOptions,
    private readonly middlewareDefinitions: readonly RuntimeMiddleware[] = [],
  ) {}

  description(
    description: string,
  ): CliProcedureBuilder<TBaseContext, TCurrentContext, TArguments, TOptions> {
    if (!description.trim()) {
      throw new CliDefinitionError(
        "invalid-command-name",
        "Command descriptions cannot be empty",
      );
    }
    return new CliProcedureBuilder(
      description,
      this.argumentDefinitions,
      this.optionDefinitions,
      this.middlewareDefinitions,
    );
  }

  args<const TNextArguments extends ArgumentMap>(
    args: TNextArguments,
  ): CliProcedureBuilder<
    TBaseContext,
    TCurrentContext,
    MergeMaps<TArguments, TNextArguments>,
    TOptions
  > {
    assertNoDuplicateKeys(this.argumentDefinitions, args, "argument");
    const merged = freezeMap({
      ...this.argumentDefinitions,
      ...args,
    }) as MergeMaps<TArguments, TNextArguments>;
    validateArguments(merged);

    return new CliProcedureBuilder(
      this.commandDescription,
      merged,
      this.optionDefinitions,
      this.middlewareDefinitions,
    );
  }

  options<const TNextOptions extends OptionMap>(
    options: TNextOptions,
  ): CliProcedureBuilder<
    TBaseContext,
    TCurrentContext,
    TArguments,
    MergeMaps<TOptions, TNextOptions>
  > {
    assertNoDuplicateKeys(this.optionDefinitions, options, "option");
    const merged = freezeMap({
      ...this.optionDefinitions,
      ...options,
    }) as MergeMaps<TOptions, TNextOptions>;
    validateOptions(merged);

    return new CliProcedureBuilder(
      this.commandDescription,
      this.argumentDefinitions,
      merged,
      this.middlewareDefinitions,
    );
  }

  use<TContextOverride extends object>(
    middleware: MiddlewareFunction<TCurrentContext, TContextOverride>,
  ): CliProcedureBuilder<
    TBaseContext,
    Overwrite<TCurrentContext, TContextOverride>,
    TArguments,
    TOptions
  > {
    const runtimeMiddleware: RuntimeMiddleware = ({ ctx, next }) =>
      middleware({
        ctx: ctx as TCurrentContext,
        next: next as MiddlewareNext,
      });

    return new CliProcedureBuilder(
      this.commandDescription,
      this.argumentDefinitions,
      this.optionDefinitions,
      [...this.middlewareDefinitions, runtimeMiddleware],
    );
  }

  command<TValue, TError extends ResultError>(
    handler: CommandHandler<
      TCurrentContext,
      TArguments,
      TOptions,
      TValue,
      TError
    >,
  ): CliCommand<TBaseContext, TArguments, TOptions, TValue> {
    const runtimeHandler: RuntimeHandler = async (input, context) =>
      handler({
        input: input as CommandInput<TArguments, TOptions>,
        ctx: context as TCurrentContext,
      });

    return new CliCommand(
      this.commandDescription,
      this.argumentDefinitions,
      this.optionDefinitions,
      this.middlewareDefinitions,
      runtimeHandler,
    );
  }
}

export type AnyCliCommand<TContext extends object> = CliCommand<
  TContext,
  ArgumentMap,
  OptionMap,
  unknown
>;

export function isCliCommand<TContext extends object>(
  value: unknown,
): value is AnyCliCommand<TContext> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    readonly [cliNodeBrand]?: unknown;
    readonly kind?: unknown;
    readonly args?: unknown;
    readonly options?: unknown;
    readonly execute?: unknown;
  };
  return (
    candidate[cliNodeBrand] === cliNodeKinds.command &&
    candidate.kind === cliNodeKinds.command &&
    typeof candidate.args === "object" &&
    candidate.args !== null &&
    typeof candidate.options === "object" &&
    candidate.options !== null &&
    typeof candidate.execute === "function"
  );
}

export type AnyArgument = AnyArgumentDescriptor;
export type AnyOption = AnyOptionDescriptor;

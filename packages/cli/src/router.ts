import { cliNodeBrand, cliNodeKinds } from "./brand.js";
import { CliDefinitionError } from "./errors.js";
import {
  isCliCommand,
  type AnyCliCommand,
  type CliCommand,
} from "./procedure.js";

export interface RouterMetadata {
  description?: string;
}

export type CliNode<TContext extends object> =
  | CliRouter<TContext, string, string>
  | AnyCliCommand<TContext>;

export type CliRouterConfig<TContext extends object> = Readonly<
  Record<string, CliNode<TContext>>
>;

type PrefixCommandPath<TPrefix extends string, TPath extends string> =
  string extends TPath ? string : `${TPrefix} ${TPath}`;

type StringKey<TKey> = TKey extends string | number ? `${TKey}` : never;

type CommandPathForNode<TName extends string, TNode> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TNode extends CliRouter<any, infer TPaths, string>
    ? PrefixCommandPath<TName, TPaths>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : TNode extends CliCommand<any, any, any, unknown>
      ? TName
      : TNode extends { readonly kind: "command" }
        ? TName
        : never;

export type CommandPathsForConfig<TConfig extends Readonly<Record<string, unknown>>> = {
  [TName in keyof TConfig]: CommandPathForNode<
    StringKey<TName>,
    TConfig[TName]
  >;
}[keyof TConfig];

export type RootKeysForConfig<
  TConfig extends Readonly<Record<string, unknown>>,
> = StringKey<keyof TConfig>;

export class CliRouter<
  TContext extends object,
  TCommandPaths extends string = string,
  TRootKeys extends string = string,
> {
  readonly kind = "router" as const;
  readonly [cliNodeBrand] = cliNodeKinds.router;
  declare private readonly _commandPaths: TCommandPaths;
  declare private readonly _rootKeys: TRootKeys;
  declare private readonly _contextInvariant: (context: TContext) => TContext;

  private readonly children: CliRouterConfig<TContext>;

  constructor(
    config: CliRouterConfig<TContext>,
    readonly metadata: Readonly<RouterMetadata> = {},
  ) {
    this.children = Object.freeze(
      Object.assign(
        Object.create(null) as Record<string, CliNode<TContext>>,
        config,
      ),
    );
    this.metadata = Object.freeze({ ...metadata });
  }

  getChildren(): CliRouterConfig<TContext> {
    return this.children;
  }
}

// `any` is intentional here: this erased router type is only used to extract
// generic metadata from routers whose concrete context remains checked at the
// public factory boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCliRouter = CliRouter<any, string, string>;

export function isCliRouter<TContext extends object>(
  value: unknown,
): value is CliRouter<TContext, string, string> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    readonly [cliNodeBrand]?: unknown;
    readonly kind?: unknown;
    readonly getChildren?: unknown;
  };
  return (
    candidate[cliNodeBrand] === cliNodeKinds.router &&
    candidate.kind === cliNodeKinds.router &&
    typeof candidate.getChildren === "function"
  );
}

export type RouterContext<TRouter extends AnyCliRouter> =
  TRouter extends CliRouter<infer TContext, infer _TCommandPaths, infer _TRootKeys>
    ? TContext
    : never;

export type RouterCommandPaths<TRouter extends AnyCliRouter> =
  TRouter extends CliRouter<infer _TContext, infer TCommandPaths, infer _TRootKeys>
    ? TCommandPaths
    : never;

export type RouterRootKeys<TRouter extends AnyCliRouter> =
  TRouter extends CliRouter<infer _TContext, infer _TCommandPaths, infer TRootKeys>
    ? TRootKeys
    : never;

function validateCommandToken(token: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(token)) {
    throw new CliDefinitionError(
      "invalid-command-name",
      `Invalid command name "${token}": use one token containing letters, numbers, hyphens, or underscores`,
    );
  }
}

function validateRouterConfig<TContext extends object>(
  config: CliRouterConfig<TContext>,
): CliRouterConfig<TContext> {
  const prototype = Object.getPrototypeOf(config) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CliDefinitionError(
      "invalid-command-name",
      "CLI router configs must define commands as own properties",
    );
  }
  const snapshot = Object.create(null) as Record<string, CliNode<TContext>>;
  for (const name of Reflect.ownKeys(config)) {
    if (typeof name !== "string") {
      throw new CliDefinitionError(
        "invalid-command-name",
        "CLI command names cannot be symbols",
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(config, name);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new CliDefinitionError(
        "invalid-command-name",
        `CLI command ${name} must be an enumerable data property`,
      );
    }
    validateCommandToken(name);
    const node = descriptor.value as unknown;
    if (!isCliRouter(node) && !isCliCommand(node)) {
      throw new CliDefinitionError(
        "invalid-command-name",
        `Invalid command definition for ${name}`,
      );
    }
    snapshot[name] = node as unknown as CliNode<TContext>;
  }
  return snapshot;
}

export function router<
  TContext extends object,
  const TConfig extends CliRouterConfig<TContext>,
>(
  config: TConfig,
  metadata?: RouterMetadata,
): CliRouter<
  TContext,
  CommandPathsForConfig<TConfig>,
  RootKeysForConfig<TConfig>
> {
  const snapshot = validateRouterConfig(config);
  return new CliRouter(snapshot, metadata);
}

type ConflictingRootKeys<
  TRouters extends readonly AnyCliRouter[],
  TSeen extends string = never,
> = TRouters extends readonly [
  infer THead extends AnyCliRouter,
  ...infer TTail extends readonly AnyCliRouter[],
]
  ?
      | Extract<RouterRootKeys<THead>, TSeen>
      | ConflictingRootKeys<TTail, TSeen | RouterRootKeys<THead>>
  : never;

export type ValidateRouterCombination<
  TRouters extends readonly [AnyCliRouter, ...AnyCliRouter[]],
> = [ConflictingRootKeys<TRouters>] extends [never]
  ? unknown
  : {
      readonly "Conflicting root command names": ConflictingRootKeys<TRouters>;
    };

export function combineRouters<
  const TRouters extends readonly [AnyCliRouter, ...AnyCliRouter[]],
>(
  ...routers: TRouters & ValidateRouterCombination<TRouters>
): CliRouter<
  RouterContext<TRouters[0]>,
  RouterCommandPaths<TRouters[number]>,
  RouterRootKeys<TRouters[number]>
> {
  const children = Object.create(null) as Record<
    string,
    CliNode<RouterContext<TRouters[0]>>
  >;

  for (const currentRouter of routers) {
    for (const [name, node] of Object.entries(currentRouter.getChildren())) {
      if (Object.hasOwn(children, name)) {
        throw new CliDefinitionError(
          "command-conflict",
          `Command conflict: ${name}`,
        );
      }
      children[name] = node as CliNode<RouterContext<TRouters[0]>>;
    }
  }

  return new CliRouter(children) as CliRouter<
    RouterContext<TRouters[0]>,
    RouterCommandPaths<TRouters[number]>,
    RouterRootKeys<TRouters[number]>
  >;
}

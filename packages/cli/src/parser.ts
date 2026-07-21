import { z } from "zod";
import { optionNameFromKey } from "./descriptors.js";
import { CliUsageError } from "./errors.js";
import { renderCommandHelp, renderRouterHelp, type CliIdentity } from "./help.js";
import type { CommandInput } from "./procedure.js";
import { isCliCommand, type AnyCliCommand } from "./procedure.js";
import { CliRouter, isCliRouter } from "./router.js";

export type DispatchResult<TContext extends object> =
  | {
      readonly type: "command";
      readonly command: AnyCliCommand<TContext>;
      readonly commandPath: readonly string[];
      readonly input: CommandInput<
        AnyCliCommand<TContext>["args"],
        AnyCliCommand<TContext>["options"]
      >;
    }
  | {
      readonly type: "help";
      readonly commandPath: readonly string[];
      readonly text: string;
    }
  | {
      readonly type: "version";
      readonly text: string;
    };

export class CliDispatchCommandError extends Error {
  constructor(
    public readonly commandPath: readonly string[],
    public readonly commandError: unknown,
  ) {
    super("CLI command input processing failed");
    this.name = "CliDispatchCommandError";
  }
}

function zodMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}

async function safeParseCommandValue(
  schema: z.ZodType,
  value: unknown,
  commandPath: readonly string[],
) {
  try {
    return await schema.safeParseAsync(value);
  } catch (error) {
    throw new CliDispatchCommandError(commandPath, error);
  }
}

async function parseCommandInput<TContext extends object>(
  argv: readonly string[],
  command: AnyCliCommand<TContext>,
  commandPath: readonly string[],
): Promise<CommandInput<
  AnyCliCommand<TContext>["args"],
  AnyCliCommand<TContext>["options"]
>> {
  const optionEntries = Object.entries(command.options);
  const optionsByLongName = new Map(
    optionEntries.map(([key, descriptor]) => [
      optionNameFromKey(key),
      { key, descriptor },
    ]),
  );
  const optionsByShortName = new Map(
    optionEntries.flatMap(([key, descriptor]) =>
      descriptor.short ? [[descriptor.short, { key, descriptor }] as const] : [],
    ),
  );
  const rawOptions = Object.create(null) as Record<string, unknown>;
  const positional: string[] = [];
  let positionalOnly = false;

  const assignOption = (key: string, value: unknown, displayName: string): void => {
    if (Object.hasOwn(rawOptions, key)) {
      throw new CliUsageError(
        "duplicate-option",
        `Option ${displayName} was provided more than once`,
        commandPath,
      );
    }
    rawOptions[key] = value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) continue;

    if (!positionalOnly && token === "--") {
      positionalOnly = true;
      continue;
    }
    if (!positionalOnly && (token === "--help" || token === "-h")) {
      throw new CliUsageError("invalid-input", "help", commandPath);
    }
    if (!positionalOnly && token.startsWith("--")) {
      const equalsIndex = token.indexOf("=");
      const longName = token.slice(2, equalsIndex === -1 ? undefined : equalsIndex);
      const match = optionsByLongName.get(longName);
      if (!match) {
        throw new CliUsageError(
          "unknown-option",
          `Unknown option: --${longName}`,
          commandPath,
        );
      }

      if (match.descriptor.kind === "flag") {
        if (equalsIndex !== -1) {
          throw new CliUsageError(
            "invalid-input",
            `Flag --${longName} does not accept a value`,
            commandPath,
          );
        }
        assignOption(match.key, true, `--${longName}`);
        continue;
      }

      const inlineValue = equalsIndex === -1 ? undefined : token.slice(equalsIndex + 1);
      const nextValue = inlineValue ?? argv[index + 1];
      if (
        nextValue === undefined ||
        (inlineValue === undefined &&
          nextValue.startsWith("-") &&
          nextValue !== "-")
      ) {
        throw new CliUsageError(
          "missing-option-value",
          `Option --${longName} requires a value`,
          commandPath,
        );
      }
      if (inlineValue === undefined) index += 1;
      assignOption(match.key, nextValue, `--${longName}`);
      continue;
    }
    if (!positionalOnly && token.startsWith("-") && token !== "-") {
      if (token.length !== 2) {
        throw new CliUsageError(
          "unknown-option",
          `Unknown option: ${token}`,
          commandPath,
        );
      }
      const shortName = token.slice(1);
      const match = optionsByShortName.get(shortName);
      if (!match) {
        throw new CliUsageError(
          "unknown-option",
          `Unknown option: ${token}`,
          commandPath,
        );
      }
      if (match.descriptor.kind === "flag") {
        assignOption(match.key, true, token);
        continue;
      }

      const nextValue = argv[index + 1];
      if (
        nextValue === undefined ||
        (nextValue.startsWith("-") && nextValue !== "-")
      ) {
        throw new CliUsageError(
          "missing-option-value",
          `Option ${token} requires a value`,
          commandPath,
        );
      }
      index += 1;
      assignOption(match.key, nextValue, token);
      continue;
    }

    positional.push(token);
  }

  const rawArguments = Object.create(null) as Record<string, unknown>;
  let positionalIndex = 0;
  for (const [key, descriptor] of Object.entries(command.args)) {
    if (descriptor.kind === "variadic-argument") {
      rawArguments[key] = positional.slice(positionalIndex);
      positionalIndex = positional.length;
    } else {
      rawArguments[key] = positional[positionalIndex];
      if (positionalIndex < positional.length) positionalIndex += 1;
    }
  }
  if (positionalIndex < positional.length) {
    throw new CliUsageError(
      "unexpected-argument",
      `Unexpected argument: ${positional[positionalIndex]}`,
      commandPath,
    );
  }

  const parsedArguments = Object.create(null) as Record<string, unknown>;
  for (const [key, descriptor] of Object.entries(command.args)) {
    if (
      descriptor.kind === "argument" &&
      !descriptor.optional &&
      rawArguments[key] === undefined
    ) {
      throw new CliUsageError(
        "invalid-input",
        `Missing required argument: ${key}`,
        commandPath,
      );
    }
    const result = await safeParseCommandValue(
      descriptor.schema,
      rawArguments[key],
      commandPath,
    );
    if (!result.success) {
      throw new CliUsageError(
        "invalid-input",
        `Invalid argument ${key}: ${zodMessage(result.error)}`,
        commandPath,
        result.error.issues,
      );
    }
    parsedArguments[key] = result.data;
  }

  const parsedOptions = Object.create(null) as Record<string, unknown>;
  for (const [key, descriptor] of optionEntries) {
    const rawValue = descriptor.kind === "flag" ? (rawOptions[key] ?? false) : rawOptions[key];
    const result = await safeParseCommandValue(
      descriptor.schema,
      rawValue,
      commandPath,
    );
    if (!result.success) {
      throw new CliUsageError(
        "invalid-input",
        `Invalid option --${optionNameFromKey(key)}: ${zodMessage(result.error)}`,
        commandPath,
        result.error.issues,
      );
    }
    parsedOptions[key] = result.data;
  }

  return {
    args: { ...parsedArguments },
    options: { ...parsedOptions },
  } as CommandInput<
    AnyCliCommand<TContext>["args"],
    AnyCliCommand<TContext>["options"]
  >;
}

export async function dispatch<TContext extends object>(
  identity: CliIdentity,
  rootRouter: CliRouter<TContext, string, string>,
  argv: readonly string[],
): Promise<DispatchResult<TContext>> {
  let currentRouter = rootRouter;
  const commandPath: string[] = [];

  if (argv.length === 1 && argv[0] === "--version") {
    return { type: "version", text: identity.version };
  }

  for (let index = 0; ; index += 1) {
    const token = argv[index];
    if (token === undefined || token === "--help" || token === "-h") {
      return {
        type: "help",
        commandPath,
        text: renderRouterHelp(identity, commandPath, currentRouter),
      };
    }
    if (token.startsWith("-")) {
      throw new CliUsageError(
        "unknown-option",
        `Unknown option: ${token}`,
        commandPath,
      );
    }

    const node = currentRouter.getChildren()[token];
    if (!node) {
      throw new CliUsageError(
        "unknown-command",
        `Unknown command: ${[...commandPath, token].join(" ")}`,
        commandPath,
      );
    }
    commandPath.push(token);

    if (isCliRouter<TContext>(node)) {
      currentRouter = node as CliRouter<TContext, string, string>;
      continue;
    }
    if (!isCliCommand<TContext>(node)) {
      throw new TypeError("Invalid CLI command tree");
    }

    const remaining = argv.slice(index + 1);
    let positionalOnly = false;
    for (const remainingToken of remaining) {
      if (remainingToken === "--") {
        positionalOnly = true;
      } else if (
        !positionalOnly &&
        (remainingToken === "--help" || remainingToken === "-h")
      ) {
        return {
          type: "help",
          commandPath,
          text: renderCommandHelp(identity, commandPath, node),
        };
      }
    }

    try {
      return {
        type: "command",
        command: node as AnyCliCommand<TContext>,
        commandPath,
        input: await parseCommandInput(
          remaining,
          node as AnyCliCommand<TContext>,
          commandPath,
        ),
      };
    } catch (error) {
      if (error instanceof CliUsageError) throw error;
      if (error instanceof CliDispatchCommandError) throw error;
      throw new CliDispatchCommandError(commandPath, error);
    }
  }
}

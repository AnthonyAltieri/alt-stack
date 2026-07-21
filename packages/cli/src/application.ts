import { isErr } from "@alt-stack/result";
import { assertPlainContext } from "./context.js";
import { CliDefinitionError, CliUsageError } from "./errors.js";
import { renderCommandHelp, renderRouterHelp, type CliIdentity } from "./help.js";
import { CliDispatchCommandError, dispatch } from "./parser.js";
import { isCliCommand } from "./procedure.js";
import { CliRouter, isCliRouter } from "./router.js";

export interface CliContextFactoryOptions<TCommandPath extends string = string> {
  readonly commandPath: TCommandPath;
  readonly input: {
    readonly args: Readonly<Record<string, unknown>>;
    readonly options: Readonly<Record<string, unknown>>;
  };
}

export interface CreateCliOptions<
  TContext extends object,
  TCommandPath extends string,
> extends CliIdentity {
  readonly router: CliRouter<TContext, TCommandPath, string>;
  readonly createContext: (
    options: CliContextFactoryOptions<TCommandPath>,
  ) => TContext | Promise<TContext>;
}

export interface CliExecutedOutcome<TCommandPath extends string = string> {
  readonly type: "executed";
  readonly exitCode: 0;
  readonly commandPath: TCommandPath;
  readonly value: unknown;
}

export interface CliHelpOutcome {
  readonly type: "help";
  readonly exitCode: 0;
  readonly commandPath: readonly string[];
  readonly text: string;
}

export interface CliVersionOutcome {
  readonly type: "version";
  readonly exitCode: 0;
  readonly text: string;
}

export interface CliUsageErrorOutcome {
  readonly type: "usage-error";
  readonly exitCode: 2;
  readonly error: CliUsageError;
  readonly help: string;
}

export interface CliCommandErrorOutcome<
  TCommandPath extends string = string,
> {
  readonly type: "command-error";
  readonly exitCode: 1;
  readonly commandPath: TCommandPath;
  readonly error: unknown;
}

export type CliOutcome<TCommandPath extends string = string> =
  | CliExecutedOutcome<TCommandPath>
  | CliHelpOutcome
  | CliVersionOutcome
  | CliUsageErrorOutcome
  | CliCommandErrorOutcome<TCommandPath>;

export interface CliApplication<TCommandPath extends string = string> {
  execute(argv: readonly string[]): Promise<CliOutcome<TCommandPath>>;
}

function renderHelpAtPath<TContext extends object>(
  identity: CliIdentity,
  rootRouter: CliRouter<TContext, string, string>,
  path: readonly string[],
): string {
  let currentRouter = rootRouter;
  const traversed: string[] = [];

  for (const segment of path) {
    const node = currentRouter.getChildren()[segment];
    if (!node) break;
    traversed.push(segment);
    if (isCliRouter<TContext>(node)) {
      currentRouter = node as CliRouter<TContext, string, string>;
      continue;
    }
    if (isCliCommand<TContext>(node)) {
      return renderCommandHelp(identity, traversed, node);
    }
    break;
  }

  return renderRouterHelp(identity, traversed, currentRouter);
}

export function createCli<
  TContext extends object,
  TCommandPath extends string,
>(
  options: CreateCliOptions<TContext, TCommandPath>,
): CliApplication<TCommandPath> {
  const identity: CliIdentity = {
    name: options.name,
    version: options.version,
    description: options.description,
  };
  const rootRouter = options.router;
  const createContext = options.createContext;

  if (!identity.name.trim() || /\s/.test(identity.name)) {
    throw new CliDefinitionError(
      "invalid-cli-identity",
      "CLI name must be one non-empty token",
    );
  }
  if (!identity.version.trim()) {
    throw new CliDefinitionError(
      "invalid-cli-identity",
      "CLI version cannot be empty",
    );
  }

  return Object.freeze({
    async execute(argv: readonly string[]): Promise<CliOutcome<TCommandPath>> {
      let resolution;
      try {
        resolution = await dispatch(
          identity,
          rootRouter as CliRouter<TContext, string, string>,
          argv,
        );
      } catch (error) {
        if (error instanceof CliUsageError) {
          return {
            type: "usage-error",
            exitCode: 2,
            error,
            help: renderHelpAtPath(
              identity,
              rootRouter as CliRouter<TContext, string, string>,
              error.commandPath,
            ),
          };
        }
        if (error instanceof CliDispatchCommandError) {
          return {
            type: "command-error",
            exitCode: 1,
            commandPath: error.commandPath.join(" ") as TCommandPath,
            error: error.commandError,
          };
        }
        throw error;
      }

      if (resolution.type === "help") {
        return { ...resolution, exitCode: 0 };
      }
      if (resolution.type === "version") {
        return { ...resolution, exitCode: 0 };
      }

      const commandPath = resolution.commandPath.join(" ") as TCommandPath;
      try {
        const context = await createContext({
          commandPath,
          input: resolution.input,
        });
        assertPlainContext(context, "createContext");
        const result = await resolution.command.execute(
          resolution.input,
          context,
        );
        if (isErr(result)) {
          return {
            type: "command-error",
            exitCode: 1,
            commandPath,
            error: result.error,
          };
        }
        return {
          type: "executed",
          exitCode: 0,
          commandPath,
          value: result.value,
        };
      } catch (error) {
        return {
          type: "command-error",
          exitCode: 1,
          commandPath,
          error,
        };
      }
    },
  });
}

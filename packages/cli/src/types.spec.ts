import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  createCli,
  initCli,
  ok,
  type CliApplication,
  type CliOutcome,
  type RouterCommandPaths,
} from "./index.js";

describe("public CLI types", () => {
  it("infers transformed input, middleware context, and nested paths", () => {
    const t = initCli<{ requestId: string; actor: string | undefined }>();
    const command = t.procedure
      .use(async ({ ctx, next }) => {
        expectTypeOf(ctx.requestId).toEqualTypeOf<string>();
        return next();
      })
      .args({
        id: t.argument(z.string().transform((value) => Number(value))),
        tags: t.variadicArgument(z.string()),
      })
      .options({
        outputPath: t.option(z.string().optional()),
        force: t.flag(),
      })
      .use(async ({ ctx, next }) => {
        expectTypeOf(ctx.requestId).toEqualTypeOf<string>();
        expectTypeOf(ctx.actor).toEqualTypeOf<string | undefined>();
        return next({ ctx: { actor: "cli" as const, authorized: true as const } });
      })
      .command(({ input, ctx }) => {
        expectTypeOf(input.args.id).toEqualTypeOf<number>();
        expectTypeOf(input.args.tags).toEqualTypeOf<string[]>();
        expectTypeOf(input.options.outputPath).toEqualTypeOf<string | undefined>();
        expectTypeOf(input.options.force).toEqualTypeOf<boolean>();
        expectTypeOf(ctx.actor).toEqualTypeOf<"cli">();
        expectTypeOf(ctx.authorized).toEqualTypeOf<true>();
        expectTypeOf(ctx.requestId).toEqualTypeOf<string>();
        return ok(input.args.id);
      });
    const appRouter = t.router({
      users: t.router({ create: command }),
      status: t.procedure.command(() => ok("up")),
      42: t.procedure.command(() => ok("answer")),
    });

    expectTypeOf<RouterCommandPaths<typeof appRouter>>().toEqualTypeOf<
      "users create" | "status" | "42"
    >();

    const application = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext: ({ commandPath }) => {
        expectTypeOf(commandPath).toEqualTypeOf<
          "users create" | "status" | "42"
        >();
        return { requestId: "request-1", actor: undefined };
      },
    });
    expectTypeOf(application).toEqualTypeOf<
      CliApplication<"users create" | "status" | "42">
    >();

    const outcomeExitCode = (
      outcome: CliOutcome<"users create" | "status" | "42">,
    ): 0 | 1 | 2 => {
      switch (outcome.type) {
        case "executed":
        case "help":
        case "version":
        case "usage-error":
        case "command-error":
          return outcome.exitCode;
        default:
          expectTypeOf(outcome).toEqualTypeOf<never>();
          return outcome;
      }
    };
    expectTypeOf(outcomeExitCode).returns.toEqualTypeOf<0 | 1 | 2>();
  });

  it("rejects incompatible router contexts and duplicate combinations", () => {
    const app = initCli<{ requestId: string }>();
    const foreign = initCli<{ accountId: string }>();
    const appRouter = app.router({
      status: app.procedure.command(() => ok()),
    });
    const duplicate = app.router({
      status: app.procedure.command(() => ok()),
    });
    const foreignRouter = foreign.router({
      users: foreign.procedure.command(() => ok()),
    });

    const invalidDefinitions = (): void => {
      // @ts-expect-error Routers with another base context cannot be nested.
      app.router({ foreign: foreignRouter });
      // @ts-expect-error Combined routers cannot define the same root command.
      app.combineRouters(appRouter, duplicate);
      // @ts-expect-error Command handlers must return an Altstack Result.
      app.procedure.command(() => "not-a-result");
    };
    expectTypeOf(invalidDefinitions).toEqualTypeOf<() => void>();
  });

  it("rejects undeclared inputs and default-context properties", () => {
    const typed = initCli<{ requestId: string }>();
    typed.procedure
      .args({ id: typed.argument(z.string()) })
      .options({ force: typed.flag() })
      .command(({ input }) => {
        const invalidInputAccess = (): void => {
          // @ts-expect-error Undeclared argument keys are not present.
          void input.args.typo;
          // @ts-expect-error Undeclared option keys are not present.
          void input.options.typo;
        };
        expectTypeOf(invalidInputAccess).toEqualTypeOf<() => void>();
        return ok(input.args.id);
      });

    const empty = initCli();
    empty.procedure.command(({ ctx }) => {
      const invalidContextAccess = (): void => {
        // @ts-expect-error The default context has no declared properties.
        void ctx.typo;
      };
      expectTypeOf(invalidContextAccess).toEqualTypeOf<() => void>();
      return ok();
    });
  });

  it("preserves base values for optional middleware collisions", () => {
    const t = initCli<{ actor: string; feature?: boolean }>();
    t.procedure
      .use(async ({ next }) => {
        const override: { actor?: number; feature?: string } = {};
        return next({ ctx: override });
      })
      .command(({ ctx }) => {
        expectTypeOf(ctx.actor).toEqualTypeOf<string | number | undefined>();
        expectTypeOf(ctx.feature).toEqualTypeOf<
          string | boolean | undefined
        >();
        return ok();
      });
  });
});

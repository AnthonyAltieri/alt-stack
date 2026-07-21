import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  CliDefinitionError,
  CliUsageError,
  TaggedError,
  createCli,
  err,
  initCli,
  ok,
} from "./index.js";
import type { MiddlewareNext, MiddlewareResult } from "./middleware.js";

class ExpectedCommandError extends TaggedError<"ExpectedCommandError"> {
  readonly _tag = "ExpectedCommandError" as const;
}

describe("createCli", () => {
  it("dispatches a nested command with parsed input and enriched context", async () => {
    const t = initCli<{ requestId: string }>();
    const handler = vi.fn(
      ({
        input,
        ctx,
      }: {
        input: {
          args: { name: string; labels: string[] };
          options: { count: number; verbose: boolean };
        };
        ctx: { requestId: string; actor: string };
      }) => ok({ input, ctx }),
    );
    const appRouter = t.router({
      users: t.router(
        {
          create: t.procedure
            .description("Create a user")
            .args({
              name: t.argument(z.string().min(1)),
              labels: t.variadicArgument(z.string()),
            })
            .options({
              count: t.option(z.coerce.number().int().positive(), { short: "c" }),
              verbose: t.flag({ short: "v" }),
            })
            .use(async ({ ctx, next }) =>
              next({
                ctx: {
                  requestId: ctx.requestId.toUpperCase(),
                  actor: "system",
                },
              }),
            )
            .command(handler),
        },
        { description: "Manage users" },
      ),
    });
    const createContext = vi.fn(() => ({ requestId: "request-1" }));
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext,
    });

    const outcome = await cli.execute([
      "users",
      "create",
      "Ada",
      "admin",
      "active",
      "-c",
      "2",
      "-v",
    ]);

    expect(outcome).toEqual({
      type: "executed",
      exitCode: 0,
      commandPath: "users create",
      value: {
        input: {
          args: { name: "Ada", labels: ["admin", "active"] },
          options: { count: 2, verbose: true },
        },
        ctx: { requestId: "REQUEST-1", actor: "system" },
      },
    });
    expect(createContext).toHaveBeenCalledOnce();
    expect(createContext).toHaveBeenCalledWith({
      commandPath: "users create",
      input: {
        args: { name: "Ada", labels: ["admin", "active"] },
        options: { count: 2, verbose: true },
      },
    });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("returns help without creating context", async () => {
    const t = initCli<{ requestId: string }>();
    const appRouter = t.router({
      users: t.router(
        {
          list: t.procedure.command(() => ok()),
        },
        { description: "Manage users" },
      ),
    });
    const createContext = vi.fn(() => ({ requestId: "unused" }));
    const cli = createCli({
      name: "acme",
      version: "1.2.3",
      description: "Acme tools",
      router: appRouter,
      createContext,
    });

    const rootHelp = await cli.execute([]);
    const groupHelp = await cli.execute(["users", "--help"]);
    const commandHelp = await cli.execute(["users", "list", "-h"]);
    const version = await cli.execute(["--version"]);

    expect(rootHelp).toMatchObject({ type: "help", commandPath: [] });
    expect(rootHelp.type === "help" && rootHelp.text).toContain("Acme tools");
    expect(groupHelp.type === "help" && groupHelp.text).toContain("Manage users");
    expect(commandHelp.type === "help" && commandHelp.text).toContain(
      "Usage: acme users list [options]",
    );
    expect(version).toEqual({ type: "version", exitCode: 0, text: "1.2.3" });
    expect(createContext).not.toHaveBeenCalled();
  });

  it("returns usage errors before context creation", async () => {
    const t = initCli<{ requestId: string }>();
    const appRouter = t.router({
      deploy: t.procedure
        .args({ environment: t.argument(z.enum(["dev", "prod"])) })
        .options({ replicas: t.option(z.coerce.number().int().positive()) })
        .command(() => ok()),
    });
    const createContext = vi.fn(() => ({ requestId: "unused" }));
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext,
    });

    const invalid = await cli.execute(["deploy", "staging", "--replicas", "x"]);
    const unknown = await cli.execute(["missing"]);

    expect(invalid).toMatchObject({
      type: "usage-error",
      exitCode: 2,
      error: { code: "invalid-input", commandPath: ["deploy"] },
    });
    expect(unknown).toMatchObject({
      type: "usage-error",
      error: { code: "unknown-command", commandPath: [] },
    });
    expect(createContext).not.toHaveBeenCalled();
  });

  it("returns schema execution failures as command errors", async () => {
    const t = initCli<{ requestId: string }>();
    const schemaError = new Error("schema exploded");
    const applicationUsageError = new CliUsageError(
      "unknown-command",
      "application schema failure",
      ["forged"],
    );
    const appRouter = t.router({
      inspect: t.procedure
        .args({
          value: t.argument(
            z.string().transform(() => {
              throw schemaError;
            }),
          ),
        })
        .command(() => ok()),
      forged: t.procedure
        .args({
          value: t.argument(
            z.string().transform(() => {
              throw applicationUsageError;
            }),
          ),
        })
        .command(() => ok()),
    });
    const createContext = vi.fn(() => ({ requestId: "unused" }));
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext,
    });

    await expect(cli.execute(["inspect", "value"])).resolves.toMatchObject({
      type: "command-error",
      exitCode: 1,
      commandPath: "inspect",
      error: schemaError,
    });
    await expect(cli.execute(["forged", "value"])).resolves.toMatchObject({
      type: "command-error",
      exitCode: 1,
      commandPath: "forged",
      error: applicationUsageError,
    });
    expect(createContext).not.toHaveBeenCalled();
  });

  it("treats Result failures and thrown errors as command errors", async () => {
    const t = initCli();
    const expectedError = new ExpectedCommandError("expected");
    const appRouter = t.router({
      expected: t.procedure.command(() => err(expectedError)),
      thrown: t.procedure.command(() => {
        throw new Error("unexpected");
      }),
    });
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext: () => ({}),
    });

    await expect(cli.execute(["expected"])).resolves.toMatchObject({
      type: "command-error",
      exitCode: 1,
      commandPath: "expected",
      error: expectedError,
    });
    await expect(cli.execute(["thrown"])).resolves.toMatchObject({
      type: "command-error",
      error: { message: "unexpected" },
    });
  });

  it("supports defaults, inline long options, and positional termination", async () => {
    const t = initCli();
    const appRouter = t.router({
      echo: t.procedure
        .args({ value: t.argument(z.string()) })
        .options({
          mode: t.option(z.string().default("safe")),
          dryRun: t.flag(),
        })
        .command(({ input }) => ok(input)),
    });
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext: () => ({}),
    });

    await expect(
      cli.execute(["echo", "hello", "--mode=fast", "--dry-run"]),
    ).resolves.toMatchObject({
      type: "executed",
      value: {
        args: { value: "hello" },
        options: { mode: "fast", dryRun: true },
      },
    });
    await expect(
      cli.execute(["echo", "hello", "--mode=--draft"]),
    ).resolves.toMatchObject({
      type: "executed",
      value: {
        args: { value: "hello" },
        options: { mode: "--draft", dryRun: false },
      },
    });
    await expect(cli.execute(["echo", "--", "--help"])).resolves.toMatchObject({
      type: "executed",
      value: {
        args: { value: "--help" },
        options: { mode: "safe", dryRun: false },
      },
    });
  });

  it("uses descriptor metadata as the positional optionality contract", async () => {
    const t = initCli();
    const appRouter = t.router({
      required: t.procedure
        .args({ value: t.argument(z.string().default("schema-default")) })
        .command(({ input }) => ok(input.args)),
      optional: t.procedure
        .args({ value: t.argument(z.string(), { optional: true }) })
        .command(({ input }) => ok(input.args)),
    });
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext: () => ({}),
    });

    await expect(cli.execute(["required"])).resolves.toMatchObject({
      type: "usage-error",
      error: { code: "invalid-input", message: "Missing required argument: value" },
    });
    await expect(cli.execute(["optional"])).resolves.toMatchObject({
      type: "executed",
      value: { value: undefined },
    });
  });

  it.each([
    [["echo", "value", "--missing"], "unknown-option"],
    [["echo", "value", "--mode"], "missing-option-value"],
    [["echo", "value", "--mode", "--force"], "missing-option-value"],
    [["echo", "value", "-m", "-f"], "missing-option-value"],
    [["echo", "value", "--mode", "a", "--mode", "b"], "duplicate-option"],
    [["echo", "one", "two"], "unexpected-argument"],
  ] as const)("classifies parser failure %j", async (argv, expectedCode) => {
    const t = initCli();
    const appRouter = t.router({
      echo: t.procedure
        .args({ value: t.argument(z.string()) })
        .options({
          mode: t.option(z.string().optional(), { short: "m" }),
          force: t.flag({ short: "f" }),
        })
        .command(() => ok()),
    });
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext: () => ({}),
    });

    await expect(cli.execute(argv)).resolves.toMatchObject({
      type: "usage-error",
      error: { code: expectedCode },
    });
  });

  it("treats prototype property names as ordinary command and input keys", async () => {
    const t = initCli();
    const appRouter = t.router({
      ["constructor"]: t.procedure
        .args({ ["__proto__"]: t.argument(z.string()) })
        .options({ toString: t.flag() })
        .command(({ input }) => ok(input)),
    });
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext: () => ({}),
    });

    await expect(
      cli.execute(["constructor", "safe", "--to-string"]),
    ).resolves.toMatchObject({
      type: "executed",
      value: {
        args: { ["__proto__"]: "safe" },
        options: { toString: true },
      },
    });
    await expect(cli.execute(["toString"])).resolves.toMatchObject({
      type: "usage-error",
      error: { code: "unknown-command" },
    });
  });

  it("dispatches numeric command keys as string paths", async () => {
    const t = initCli();
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: t.router({ 42: t.procedure.command(() => ok("answer")) }),
      createContext: () => ({}),
    });

    await expect(cli.execute(["42"])).resolves.toMatchObject({
      type: "executed",
      commandPath: "42",
      value: "answer",
    });
  });

  it("enforces middleware ordering and exact next-result propagation", async () => {
    const t = initCli();
    const shortCircuitError = new ExpectedCommandError("stop");
    const events: string[] = [];
    const appRouter = t.router({
      stopped: t.procedure
        .use(async ({ next }) => {
          events.push("outer-before");
          const result = await next();
          events.push("outer-after");
          return result;
        })
        .use(async () => {
          events.push("short-circuit");
          return err(shortCircuitError);
        })
        .command(() => {
          events.push("handler");
          return ok();
        }),
      replaced: t.procedure
        .use(async ({ next }) => {
          await next();
          return err(shortCircuitError);
        })
        .command(() => {
          events.push("replaced-handler");
          return ok();
        }),
      doubled: t.procedure
        .use(async ({ next }) => {
          await next();
          return next();
        })
        .command(() => ok()),
    });
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext: () => {
        events.push("context");
        return {};
      },
    });

    await expect(cli.execute(["stopped"])).resolves.toMatchObject({
      type: "command-error",
      error: shortCircuitError,
    });
    expect(events).toEqual([
      "context",
      "outer-before",
      "short-circuit",
      "outer-after",
    ]);

    events.length = 0;
    await expect(cli.execute(["replaced"])).resolves.toMatchObject({
      type: "command-error",
      error: { message: "CLI middleware must return the result of next()" },
    });
    expect(events).toEqual(["context", "replaced-handler"]);

    events.length = 0;
    await expect(cli.execute(["doubled"])).resolves.toMatchObject({
      type: "command-error",
      error: { message: "CLI middleware cannot call next() more than once" },
    });
  });

  it("preserves plain context identity through pass-through middleware", async () => {
    const context = { requestId: "request-1" };
    const t = initCli<typeof context>();
    const appRouter = t.router({
      inspect: t.procedure
        .use(async ({ next }) => next())
        .command(({ ctx }) => ok({ same: ctx === context, id: ctx.requestId })),
    });
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext: () => context,
    });

    await expect(cli.execute(["inspect"])).resolves.toMatchObject({
      type: "executed",
      value: { same: true, id: "request-1" },
    });
  });

  it("preserves base values when optional context overrides are absent", async () => {
    const t = initCli<{ actor: string }>();
    const appRouter = t.router({
      inspect: t.procedure
        .use(async ({ next }) => {
          const override: { actor?: number } = {};
          return next({ ctx: override });
        })
        .command(({ ctx }) => ok(ctx.actor)),
    });
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext: () => ({ actor: "system" }),
    });

    await expect(cli.execute(["inspect"])).resolves.toMatchObject({
      type: "executed",
      value: "system",
    });
  });

  it("rejects non-plain context containers", async () => {
    class AppContext {
      readonly requestId = "request-1";

      label(): string {
        return `id:${this.requestId}`;
      }
    }

    const context = new AppContext();
    const t = initCli<AppContext>();
    const appRouter = t.router({
      inspect: t.procedure.command(({ ctx }) => ok(ctx.label())),
    });
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext: () => context,
    });

    await expect(cli.execute(["inspect"])).resolves.toMatchObject({
      type: "command-error",
      error: { message: "createContext must provide a plain context object" },
    });
  });

  it("does not execute a captured next after middleware settles", async () => {
    const t = initCli();
    const stopError = new ExpectedCommandError("stop");
    let capturedNext: MiddlewareNext | undefined;
    const handler = vi.fn(() => ok());
    const appRouter = t.router({
      inspect: t.procedure
        .use(async ({ next }) => {
          capturedNext = next;
          return err(stopError);
        })
        .command(handler),
    });
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext: () => ({}),
    });

    await expect(cli.execute(["inspect"])).resolves.toMatchObject({
      type: "command-error",
      error: stopError,
    });
    queueMicrotask(() => {
      void capturedNext?.();
    });
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not execute next scheduled before middleware settlement", async () => {
    const t = initCli();
    const stopError = new ExpectedCommandError("stop");
    const handler = vi.fn(() => ok());
    let scheduledNextResolved: () => void = () => undefined;
    const scheduledNext = new Promise<void>((resolve) => {
      scheduledNextResolved = resolve;
    });
    const appRouter = t.router({
      inspect: t.procedure
        .use(async ({ next }) => {
          queueMicrotask(() => {
            void next().then(scheduledNextResolved, scheduledNextResolved);
          });
          return err(stopError);
        })
        .command(handler),
    });
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext: () => ({}),
    });

    await expect(cli.execute(["inspect"])).resolves.toMatchObject({
      type: "command-error",
      error: {
        message: "CLI middleware must return the result of next()",
      },
    });
    await scheduledNext;
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects a next result reused across invocations", async () => {
    const t = initCli();
    let cachedNextResult: MiddlewareResult<Record<never, never>> | undefined;
    const handler = vi.fn(() => ok());
    const appRouter = t.router({
      inspect: t.procedure
        .use(async ({ next }) => {
          cachedNextResult ??= await next();
          return cachedNextResult;
        })
        .command(handler),
    });
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: appRouter,
      createContext: () => ({}),
    });

    await expect(cli.execute(["inspect"])).resolves.toMatchObject({
      type: "executed",
    });
    await expect(cli.execute(["inspect"])).resolves.toMatchObject({
      type: "command-error",
      error: {
        message: "CLI middleware cannot reuse a result from another invocation",
      },
    });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("captures application dependencies at creation time", async () => {
    const t = initCli<{ source: string }>();
    const firstRouter = t.router({
      status: t.procedure.command(({ ctx }) => ok(`first:${ctx.source}`)),
    });
    const secondRouter = t.router({
      status: t.procedure.command(({ ctx }) => ok(`second:${ctx.source}`)),
    });
    const options = {
      name: "acme",
      version: "1.0.0",
      router: firstRouter,
      createContext: () => ({ source: "original" }),
    };
    const cli = createCli(options);

    options.router = secondRouter;
    options.createContext = () => ({ source: "replacement" });

    await expect(cli.execute(["status"])).resolves.toMatchObject({
      type: "executed",
      value: "first:original",
    });
  });
});

describe("CLI definition validation", () => {
  it("rejects invalid CLI identity metadata", () => {
    const t = initCli();
    const appRouter = t.router({ status: t.procedure.command(() => ok()) });

    expect(() =>
      createCli({
        name: "bad name",
        version: "1.0.0",
        router: appRouter,
        createContext: () => ({}),
      }),
    ).toThrowError(
      expect.objectContaining({ code: "invalid-cli-identity" }),
    );
    expect(() =>
      createCli({
        name: "acme",
        version: "",
        router: appRouter,
        createContext: () => ({}),
      }),
    ).toThrowError(
      expect.objectContaining({ code: "invalid-cli-identity" }),
    );
  });

  it("rejects ambiguous argument and option definitions", () => {
    const t = initCli();
    const symbolKey = Symbol("hidden");

    expect(() =>
      t.procedure.args({
        optional: t.argument(z.string(), { optional: true }),
        required: t.argument(z.string()),
      }),
    ).toThrowError(CliDefinitionError);
    expect(() =>
      t.procedure.options({
        fooBar: t.flag(),
        foo_bar: t.flag(),
      }),
    ).toThrowError(/Duplicate long option name/);
    expect(() =>
      t.procedure.options({
        "bad key": t.flag(),
      }),
    ).toThrowError(/valid long option name/);
    expect(() =>
      t.procedure.args({
        values: t.variadicArgument(z.string()),
        trailing: t.argument(z.string()),
      }),
    ).toThrowError(/appear last/);
    expect(() =>
      t.procedure.args({
        [symbolKey]: t.argument(z.string()),
      }),
    ).toThrowError(/cannot be symbols/);
  });

  it("rejects root command conflicts when combining routers", () => {
    const t = initCli();
    const first = t.router({ status: t.procedure.command(() => ok()) });
    const second = t.router({ status: t.procedure.command(() => ok()) });
    const combine = t.combineRouters as unknown as (
      ...routers: typeof first[]
    ) => unknown;

    expect(() => combine(first, second)).toThrowError(/Command conflict/);
  });

  it("rejects router configs whose commands are inherited", () => {
    const t = initCli();
    const command = t.procedure.command(() => ok());
    const inheritedConfig = { __proto__: command };

    expect(() => t.router(inheritedConfig)).toThrowError(/own properties/);
  });

  it("rejects accessor-backed router commands without evaluating them", () => {
    const t = initCli();
    const command = t.procedure.command(() => ok());
    const config = {} as { run: typeof command };
    const accessor = vi.fn(() => command);
    Object.defineProperty(config, "run", {
      enumerable: true,
      get: accessor,
    });

    expect(() => t.router(config)).toThrowError(/data property/);
    expect(accessor).not.toHaveBeenCalled();
  });
});

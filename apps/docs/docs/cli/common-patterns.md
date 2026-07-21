# CLI Common Patterns

`@alt-stack/cli` separates command definition, pure execution, and terminal rendering. This keeps nested command trees reusable and makes validation and lifecycle behavior straightforward to test.

## Share procedure policy with immutable builders

Every procedure method returns a new builder. Keep a shared policy and derive commands without mutating earlier definitions:

```typescript
const tracedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const startedAt = Date.now();
  const result = await next({ ctx: { startedAt } });
  ctx.logger.info({ elapsedMs: Date.now() - startedAt });
  return result;
});

const inspect = tracedProcedure.command(({ ctx }) => {
  ctx.logger.info({ startedAt: ctx.startedAt });
  return ok();
});
```

Middleware runs in declaration order. `next({ ctx })` shallowly overwrites the current context for downstream middleware and the handler, and its override is reflected in the handler type. Return the exact value from `next()`; a middleware may instead return `err(taggedError)` to stop the chain. Calling `next()` more than once is rejected at runtime.

Base contexts and `next({ ctx })` overrides are plain object containers with a standard or null prototype. Store class-based dependencies as properties—for example `{ logger: new Logger() }`—instead of returning a class instance as the context container. The continuation is lazy until its promise is consumed by awaiting, returning, or chaining it. Once consumed, downstream effects are not rolled back if middleware later returns a different result; a valid middleware must return the exact result of `next()`. An unconsumed continuation cannot execute a handler after that middleware has settled.

## Use explicit grammar and Zod output types

CLI token grammar comes from the descriptor helper, while value semantics come from Zod:

```typescript
const deploy = t.procedure
  .args({
    environment: t.argument(z.enum(["dev", "prod"])),
    files: t.variadicArgument(z.string()),
  })
  .options({
    replicas: t.option(z.coerce.number().int().positive(), { short: "r" }),
    format: t.option(z.enum(["text", "json"]).default("text")),
    dryRun: t.flag(),
  })
  .command(({ input }) => ok(input));
```

- `argument` consumes one positional token. Set `optional: true` explicitly when it may be omitted.
- `variadicArgument` consumes zero or more remaining positional tokens and must be last.
- `option` consumes a value through `--name value`, `--name=value`, or its configured one-character short spelling.
- `flag` consumes no value and always yields a boolean, defaulting to `false`.
- `--` ends option parsing, allowing positional values such as `--help` or `-1`.

Schemas receive strings, `undefined`, arrays of strings, or booleans according to their descriptor. Use `z.coerce` or `transform` when a string option should become a number or another runtime type. Async refinements and transforms are supported.

When an option value itself begins with `-`, use the inline long form, such as `--label=--draft` or `--threshold=-1`. In the separated form, a hyphen-leading token is treated as another option so a missing value cannot silently consume the next flag.

## Compose command families

Routers preserve their hierarchy rather than flattening command names:

```typescript
const projectRouter = t.router({
  create: createProject,
  remove: removeProject,
});

const accountRouter = t.router({
  login,
  logout,
});

const appRouter = t.combineRouters(
  t.router({ project: projectRouter }),
  t.router({ account: accountRouter }),
);
```

`combineRouters` rejects repeated root command names at compile time and at runtime. Nested routers must come from an `initCli` factory with the same base context.

## Treat execution as a pure boundary

`createCli` does not read or write global process state. Its `execute(argv)` method resolves to exactly one outcome:

| Outcome | Exit code | Meaning |
| --- | --- | --- |
| `executed` | `0` | a handler returned `ok(value)` |
| `help` | `0` | root, group, or command help was requested |
| `version` | `0` | root `--version` was requested |
| `usage-error` | `2` | routing, token parsing, or Zod validation failed |
| `command-error` | `1` | context creation, middleware, or a handler failed or returned `err(error)` |

Help, version, and usage failures do not create context or run middleware. Context is created once for a valid executable invocation and receives the normalized input.

Ordinary Zod validation failures are usage errors. If application code inside a Zod transform or refinement throws instead of returning a validation issue, the original exception is preserved as a command error and context is not created.

```typescript
const outcome = await cli.execute(["project", "create", "demo"]);

switch (outcome.type) {
  case "executed":
    console.info(outcome.value);
    break;
  case "help":
  case "version":
    console.info(outcome.text);
    break;
  case "usage-error":
    console.error(outcome.error.message, outcome.help);
    break;
  case "command-error":
    console.error(outcome.error);
    break;
}
```

## Keep the executable shim thin

Use `runCli` when the standard exit-code and stream behavior fits. Pass only the application arguments, not the runtime executable and script path:

```typescript
const exitCode = await runCli(cli, {
  argv: process.argv.slice(2),
  stdout: process.stdout,
  stderr: process.stderr,
  formatValue: (value) => value === undefined ? undefined : JSON.stringify(value),
  formatError: (error) => error instanceof Error ? error.message : String(error),
});

process.exitCode = exitCode;
```

Successful values are silent unless `formatValue` returns a string. Help and version go to `stdout`; usage and command errors go to `stderr`. The application, not the library, decides whether to assign the returned code to `process.exitCode`.

## Current v1 boundaries

Aliases, clustered short flags, negated flags, inherited custom group options, executable command groups, completion generation, output schemas, declared command-error schemas, telemetry, and plugin discovery are not part of the v1 contract. Use explicit leaf commands and keep cross-command services in the base context.

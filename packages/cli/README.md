# `@alt-stack/cli`

`@alt-stack/cli` builds type-safe command-line applications from immutable procedures and nested routers. Arguments and options are parsed with Zod, middleware can refine invocation context, and handlers return `Result` values.

## Install

```bash
pnpm add @alt-stack/cli zod
```

## Define and run a nested CLI

```typescript
import { createCli, initCli, ok, runCli } from "@alt-stack/cli";
import { randomUUID } from "node:crypto";
import { z } from "zod";

interface AppContext {
  requestId: string;
}

const t = initCli<AppContext>();

const appRouter = t.router({
  users: t.router(
    {
      create: t.procedure
        .description("Create a user")
        .args({
          name: t.argument(z.string().min(1), { metavar: "name" }),
        })
        .options({
          role: t.option(z.enum(["admin", "member"]).default("member"), {
            short: "r",
            metavar: "role",
          }),
          notify: t.flag({ short: "n" }),
        })
        .command(({ input, ctx }) => {
          return ok({
            requestId: ctx.requestId,
            name: input.args.name,
            role: input.options.role,
            notify: input.options.notify,
          });
        }),
    },
    { description: "Manage users" },
  ),
});

const cli = createCli({
  name: "acme",
  version: "1.0.0",
  description: "Acme administration tools",
  router: appRouter,
  createContext: () => ({ requestId: randomUUID() }),
});

async function main(): Promise<void> {
  const exitCode = await runCli(cli, {
    argv: process.argv.slice(2),
    stdout: process.stdout,
    stderr: process.stderr,
    formatValue: (value) => JSON.stringify(value, null, 2),
  });
  process.exitCode = exitCode;
}

void main();
```

This produces commands such as:

```bash
acme users create Ada --role admin --notify
acme users create --help
acme --version
```

`createCli().execute(argv)` has no ambient process dependency. It returns one of `executed`, `help`, `version`, `usage-error`, or `command-error`, so applications can embed the same CLI in tests or another host without intercepting output or exits. `runCli` is the optional terminal renderer and writes only to the streams supplied by the caller.

The object returned by `createContext` is the invocation-scoped context container and must be a plain object (standard or null prototype). Put class-based clients, loggers, and other service instances in properties of that container rather than returning a class instance as the container itself.

See the [CLI quickstart](../../apps/docs/docs/cli/quickstart.md), [common patterns](../../apps/docs/docs/cli/common-patterns.md), and [API documentation](../../apps/docs/docs/cli/api.md).

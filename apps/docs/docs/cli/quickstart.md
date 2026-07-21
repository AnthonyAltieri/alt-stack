# CLI Quickstart

Build a nested, type-safe command-line application with `@alt-stack/cli`. A router describes the command hierarchy, procedure descriptors parse and validate tokens with Zod, and a small runner connects explicit outcomes to terminal streams.

## Install

```bash
pnpm add @alt-stack/cli zod
pnpm add -D tsx typescript @types/node
```

## Define the command tree

Create `src/cli.ts`:

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
          name: t.argument(z.string().min(1), {
            description: "Display name",
            metavar: "name",
          }),
        })
        .options({
          role: t.option(z.enum(["admin", "member"]).default("member"), {
            description: "Initial role",
            metavar: "role",
            short: "r",
          }),
          notify: t.flag({
            description: "Send a welcome message",
            short: "n",
          }),
        })
        .command(({ input, ctx }) =>
          ok({
            requestId: ctx.requestId,
            name: input.args.name,
            role: input.options.role,
            notify: input.options.notify,
          }),
        ),
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

`initCli<AppContext>()` binds every procedure and nested router to the same base context. Descriptor schemas contribute their Zod output types to the handler, so `role` is inferred as `"admin" | "member"` and the absent `notify` flag becomes `false`.

## Run it

```bash
pnpm exec tsx src/cli.ts users create Ada --role admin --notify
pnpm exec tsx src/cli.ts users create --help
pnpm exec tsx src/cli.ts --version
```

The first invocation validates all input before `createContext` runs. The command handler returns an Altstack `Result`; `ok(value)` becomes an `executed` outcome, while `err(error)` becomes `command-error`.

`runCli` is only the terminal adapter. Tests and embedded hosts can call `cli.execute(["users", "create", "Ada"])` directly and inspect the returned `CliOutcome` without replacing `process.argv`, intercepting output, or preventing a process exit.

## Next steps

- Use [common patterns](./common-patterns.md) for middleware context, router composition, parser behavior, and custom outcome rendering.
- Use the [`@alt-stack/cli` API documentation](./api.md) for the complete supported surface.

# `@alt-stack/server-bun`

Bun-native adapter for Altstack's typed routers, Zod validation, Result errors, OpenAPI, and request telemetry.

## Quickstart

```bash
bun add @alt-stack/server-bun zod
```

```typescript
import {
  createServer,
  init,
  ok,
  type BunBaseContext,
} from "@alt-stack/server-bun";
import { z } from "zod";

const t = init<BunBaseContext>();

const api = t.router({
  "/hello/{name}": t.procedure
    .input({ params: z.object({ name: z.string() }) })
    .output(z.object({ message: z.string() }))
    .get(({ input }) => ok({ message: `Hello, ${input.params.name}` })),
});

const server = createServer(
  { "/api": api },
  { port: 3000 },
);

console.log(server.url.href);
```

`createServer()` calls `Bun.serve()` immediately. Call `server.stop()` during shutdown and test cleanup. See the full [server quickstart](../../apps/docs/docs/server/quickstart.md).

## Common Patterns

- Extend `BunBaseContext`, pass it to `init()`, and return application fields from `createContext(req, server)`; the adapter supplies `ctx.bun` and `ctx.span`.
- Include the Altstack router returned by `createDocsRouter()` in the same server config.
- Return `ok(new Response(...))` for custom status, headers, or non-JSON bodies.
- Set `port: 0` for an ephemeral test server; default port is 3000 and hostname is `0.0.0.0`.
- Install/configure `@opentelemetry/api` before enabling telemetry.

Current caveats: only Bun is supported; the package exports TypeScript source and uses the global `Bun`. Repeated query keys keep the last value. Invalid JSON becomes `{}`. Output schemas are parsed synchronously. Declared runtime errors are enveloped, but generated OpenAPI error schemas are flat.

See [Server common patterns](../../apps/docs/docs/server/common-patterns.md).

## API Documentation

[Bun API Documentation](../../apps/docs/docs/server/api/bun.md) covers `createServer`, every option/default, `BunServer`, `BunBaseContext`, `createDocsRouter`, typed router helpers, exact core re-exports, 404/error behavior, and runtime constraints.

## Peer dependencies

- `zod` `^4.0.0`
- Bun runtime and Bun's built-in types

## License

MIT

# `@alt-stack/server-hono`

Hono 4 adapter for Altstack's typed routers, Zod validation, Result errors, OpenAPI, and request telemetry.

## Quickstart

```bash
pnpm add @alt-stack/server-hono hono zod @hono/node-server
```

`@hono/node-server` is only for this Node example; use the Hono host adapter for your runtime.

```typescript
import { serve } from "@hono/node-server";
import {
  createServer,
  init,
  ok,
  type HonoBaseContext,
} from "@alt-stack/server-hono";
import { z } from "zod";

const t = init<HonoBaseContext>();

const api = t.router({
  "/hello/{name}": t.procedure
    .input({ params: z.object({ name: z.string() }) })
    .output(z.object({ message: z.string() }))
    .get(({ input }) => ok({ message: `Hello, ${input.params.name}` })),
});

const app = createServer({ "/api": api });
serve({ fetch: app.fetch, port: 3000 });
```

See the full [server quickstart](../../apps/docs/docs/server/quickstart.md).

## Common Patterns

- Extend `HonoBaseContext`, pass that type to `init()`, and return only application fields from `createContext(c)`; the adapter supplies `ctx.hono` and `ctx.span`.
- Mount `createDocsRouter()` as another Altstack router to serve OpenAPI JSON and optional Swagger UI.
- Return `ok(new Response(...))` for HTML, streams, redirects, or custom status codes.
- Enable telemetry with `telemetry: true` or a config object after installing/configuring `@opentelemetry/api`.
- Use `createServer().middleware` for simple native Hono handlers, or attach fully typed Hono middleware to the returned app.

Current caveats: `createServer().docs` is declared but unused; create and mount a docs router explicitly. Hono attempts JSON parsing for every procedure and uses `{}` when parsing fails. Output schemas are parsed synchronously. Declared runtime errors are enveloped, but generated OpenAPI error schemas are flat.

See [Server common patterns](../../apps/docs/docs/server/common-patterns.md).

## API Documentation

[Hono API Documentation](../../apps/docs/docs/server/api/hono.md) covers `createServer`, every option, `createDocsRouter`, `CreateDocsRouterOptions`, `HonoBaseContext`, typed router helpers, exact core re-exports, response/error behavior, and unsupported paths.

## Peer dependencies

- `hono` `^4.0.0`
- `zod` `^4.0.0`

## License

MIT

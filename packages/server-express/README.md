# `@alt-stack/server-express`

Express 4/5 adapter for Altstack's typed routers, Zod validation, Result errors, OpenAPI, and request telemetry.

## Quickstart

```bash
pnpm add @alt-stack/server-express express zod
```

```typescript
import {
  createServer,
  init,
  ok,
  type ExpressBaseContext,
} from "@alt-stack/server-express";
import { z } from "zod";

const t = init<ExpressBaseContext>();

const api = t.router({
  "/hello/{name}": t.procedure
    .input({ params: z.object({ name: z.string() }) })
    .output(z.object({ message: z.string() }))
    .get(({ input }) => ok({ message: `Hello, ${input.params.name}` })),
});

const app = createServer({ "/api": api });
app.listen(3000);
```

See the full [server quickstart](../../apps/docs/docs/server/quickstart.md).

## Common Patterns

- Extend `ExpressBaseContext`, pass that type to `init()`, and return application fields from `createContext(req, res)`; the adapter supplies `ctx.express` and `ctx.span`.
- Mount the returned app beneath an existing Express app with `parent.use("/v1", app)` when you need a real base path.
- Mount the native router returned by `createDocsRouter()` with `app.use("/docs", docs)`.
- Install/configure `@opentelemetry/api` and enable telemetry with a boolean or config object.

Current caveats: the `basePath` option only changes telemetry route labels and does not mount routes. Handler-level Web `Response` passthrough is unsupported; successes are sent with `res.json()`. Output schemas are parsed synchronously. Declared runtime errors are enveloped, but generated OpenAPI error schemas are flat.

See [Server common patterns](../../apps/docs/docs/server/common-patterns.md).

## API Documentation

[Express API Documentation](../../apps/docs/docs/server/api/express.md) covers `createServer`, every option, `createDocsRouter`, `CreateDocsRouterOptions`, `ExpressBaseContext`, typed router helpers, exact core re-exports, response/error behavior, and mounting caveats.

## Peer dependencies

- `express` `^4.0.0 || ^5.0.0`
- `zod` `^4.0.0`

## License

MIT

# `@alt-stack/server-tanstack-start`

TanStack Start file-route adapter for Altstack procedures. It creates idiomatic uppercase `server.handlers`, attaches source metadata for OpenAPI generation, and preserves other TanStack route options.

## Quickstart

```bash
pnpm add @alt-stack/server-tanstack-start @tanstack/react-router zod
```

In a generated file route such as `routes/api/users/$id.ts`:

```typescript
import {
  createAltStackFileRoute,
  init,
  ok,
  type TanStackBaseContext,
} from "@alt-stack/server-tanstack-start";
import { z } from "zod";

const t = init<TanStackBaseContext>();

export const Route = createAltStackFileRoute("/api/users/$id")({
  server: {
    handlers: {
      GET: t.procedure
        .input({ params: z.object({ id: z.string() }) })
        .output(z.object({ id: z.string() }))
        .handler(({ input }) => ok({ id: input.params.id })),
    },
  },
});
```

Use uppercase method keys with pending `.handler()` procedures. `$id` is recorded as `{id}` and requires an `input.params.id` schema. The path must exist in TanStack's generated `FileRoutesByPath` type.

See the full [server quickstart](../../apps/docs/docs/server/quickstart.md).

## CORS

This adapter has no `cors` option because TanStack Start exposes no dedicated native CORS facility. Configure CORS through Start request or route middleware, or a custom server entry; Alt Stack does not synthesize a CORS policy or preflight handler.

## Common Patterns

- Put application context creation in `server.createContext({ request, params, context })`; the adapter supplies `ctx.tanstack`.
- Return `ok(new Response(...))` for custom statuses or non-JSON bodies.
- Use `defineServerRoute()` when another layer owns file-route creation.
- Pass file routes or defined routes to `generateOpenAPISpecFromServerRoutes()` and serve/write the returned object yourself.
- Route options and extra server options are forwarded to TanStack; Altstack consumes `handlers`, `createContext`, and `defaultErrorHandlers`.

Current caveats: there is no docs UI helper and no automatic telemetry option/span creation. Repeated query keys become arrays. Non-JSON bodies are read as text only when a body schema exists. Output validation is asynchronous (unlike the other adapters). Declared runtime errors are enveloped, while generated OpenAPI schemas are flat and always describe success as 200.

See [Server common patterns](../../apps/docs/docs/server/common-patterns.md).

## API Documentation

[TanStack Start API Documentation](../../apps/docs/docs/server/api/tanstack-start.md) covers `createAltStackFileRoute`, `defineServerRoute`, `generateOpenAPISpecFromServerRoutes`, path utilities, every public type/property, runtime parsing, response/error behavior, exact core re-exports, and unsupported helpers.

## Peer dependencies

- `@tanstack/react-router` `^1.170.9`
- `zod` `^4.0.0`

## License

MIT

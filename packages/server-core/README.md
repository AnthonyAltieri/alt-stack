# `@alt-stack/server-core`

Framework-neutral routers, validated procedures, middleware, OpenAPI generation, telemetry helpers, and Result re-exports for Altstack HTTP servers.

Most applications install an adapter package instead. Use core directly when you are building a custom adapter, generating OpenAPI without hosting, or sharing transport-neutral router definitions.

## Quickstart

```bash
pnpm add @alt-stack/server-core zod
```

```typescript
import {
  generateOpenAPISpec,
  init,
  ok,
} from "@alt-stack/server-core";
import { z } from "zod";

const t = init();

const users = t.router({
  "/users/{id}": t.procedure
    .input({ params: z.object({ id: z.string() }) })
    .output(z.object({ id: z.string() }))
    .get(({ input }) => ok({ id: input.params.id })),
});

const openapi = generateOpenAPISpec(
  { "/api": users },
  { title: "Users API", version: "1.0.0" },
);
```

Core does not listen for requests. A custom adapter consumes `Router.getProcedures()`, validates raw input with `validateInput()`, constructs context, executes middleware/handlers, maps tagged errors, validates output, and closes telemetry spans.

For a hosted service, choose:

- `@alt-stack/server-hono`
- `@alt-stack/server-express`
- `@alt-stack/server-bun`
- `@alt-stack/server-nestjs`
- `@alt-stack/server-tanstack-start`

See the [server quickstart](../../apps/docs/docs/server/quickstart.md).

## Common Patterns

- Build procedures from `init<TContext>().procedure` and return `ok()` or `err()` from every handler.
- Use OpenAPI `{param}` paths and string-compatible Zod input schemas for params/query values.
- Declare tagged error schemas with a direct `_tag: z.literal("...")` field.
- Compose nested routers by prefix; router merges append and do not detect duplicates.
- Await `initTelemetry()` before serving when the first request must be traced.

The current adapters wrap declared errors under `{ error: ... }`, while core OpenAPI emits the declared schema as the entire body. Automatic 400/500 responses are not added to OpenAPI. Read [Server common patterns](../../apps/docs/docs/server/common-patterns.md) before treating the generated spec as an exact wire contract.

## API Documentation

The complete public surface—including every router/builder member, middleware protocol type, validation helper, OpenAPI property, telemetry option, Result re-export, and current limitation—is in [Server core API Documentation](../../apps/docs/docs/server/api/core.md).

Zod 4 is a required peer. `@opentelemetry/api` 1.x is an optional peer; install it when telemetry is enabled.

## License

MIT

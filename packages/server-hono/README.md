# @alt-stack/server-hono

A lightweight, type-safe server framework built on [Hono](https://hono.dev/) with Zod validation. Inspired by tRPC's builder pattern, providing full type inference from a central router definition.

## Documentation

📚 **Full documentation is available at:** [Server Framework Docs](./../../apps/docs/)

## Installation

```bash
pnpm add @alt-stack/server-hono hono zod
# or
npm install @alt-stack/server-hono hono zod
# or
yarn add @alt-stack/server-hono hono zod
```

## Peer Dependencies

- **hono**: `^4.0.0` - The underlying HTTP framework
- **zod**: `^4.0.0` - For schema validation and type inference

## Quick Start

```typescript
import { init, createServer, router } from "@alt-stack/server-hono";
import { z } from "zod";

// Initialize with optional custom context
const factory = init<{ user: { id: string } | null }>();

// Create a router with type-safe procedures
const appRouter = router({
  "/users/{id}": factory.procedure
    .input({
      params: z.object({ id: z.string() }),
    })
    .output(z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }))
    .get(({ input }) => ({
      id: input.params.id,
      name: "Alice",
      email: "alice@example.com",
    })),

  "/users": {
    get: factory.procedure
      .output(z.array(z.object({ id: z.string(), name: z.string() })))
      .handler(() => [{ id: "1", name: "Alice" }]),

    post: factory.procedure
      .input({
        body: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
      })
      .output(z.object({ id: z.string() }))
      .handler(({ input }) => ({ id: crypto.randomUUID() })),
  },
});

// Create server with context
const app = createServer(
  { api: appRouter },
  {
    createContext: (c) => ({
      user: getUserFromRequest(c.req.header("Authorization")),
    }),
  }
);

export default app;
```

## Features

- **Type-safe routes**: Full TypeScript inference from Zod schemas
- **Builder pattern**: Fluent API for defining routes with `.get()`, `.post()`, etc.
- **Type-safe errors**: `ctx.error()` with automatic status code inference
- **Reusable procedures**: Create middleware chains with context extension
- **Router combination**: Nest routers for modular API design
- **Validation**: Automatic Zod validation for params, query, and body
- **OpenAPI generation**: Built-in Swagger UI with `createDocsRouter()`
- **Native Hono context**: Access full Hono API via `ctx.hono`

## Context Access

In handlers and middleware, access the Hono context via `ctx.hono`:

```typescript
.get(({ ctx }) => {
  // Access Hono's context directly
  const url = ctx.hono.req.url;
  const headers = ctx.hono.req.header();
  
  // Return responses
  return ctx.hono.json({ message: "Hello" });
})
```

## OpenAPI Documentation

Generate and serve OpenAPI docs:

```typescript
import { createDocsRouter, createServer } from "@alt-stack/server-hono";

const docsRouter = createDocsRouter(
  { api: appRouter },
  { title: "My API", version: "1.0.0" }
);

const app = createServer({
  api: appRouter,
  docs: docsRouter,  // Available at /docs
});
```

## Input Type Constraints

Since HTTP path parameters and query strings are always strings, `input.params` and `input.query` schemas must accept string input:

| Schema | Allowed in params/query? |
|--------|--------------------------|
| `z.string()` | ✅ |
| `z.enum(["a", "b"])` | ✅ |
| `z.coerce.number()` | ✅ |
| `z.string().transform(...)` | ✅ |
| `z.number()` | ❌ compile error |
| `z.boolean()` | ❌ compile error |

```typescript
// ✅ Valid
.input({
  params: z.object({ id: z.string() }),
  query: z.object({ page: z.coerce.number() }),
})

// ❌ Compile error
.input({
  params: z.object({ id: z.number() }), // Error!
})
```

## Migration from @alt-stack/server

If you're migrating from the deprecated `@alt-stack/server` package:

```typescript
// Before
import { createServer, router } from "@alt-stack/server";

// After
import { createServer, router } from "@alt-stack/server-hono";
```

Handler code remains the same - `ctx.hono` is still available.

## Related Packages

- [`@alt-stack/server-core`](../server-core/README.md) - Core types and utilities
- [`@alt-stack/server-express`](../server-express/README.md) - Express adapter
- [`@alt-stack/client`](../client/README.md) - Type-safe API client

## License

MIT


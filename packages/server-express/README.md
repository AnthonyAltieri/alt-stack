# @alt-stack/server-express

A lightweight, type-safe server framework built on [Express](https://expressjs.com/) with Zod validation. Inspired by tRPC's builder pattern, providing full type inference from a central router definition.

## Documentation

📚 **Full documentation is available at:** [Server Framework Docs](./../../apps/docs/)

## Installation

```bash
pnpm add @alt-stack/server-express express zod
# or
npm install @alt-stack/server-express express zod
# or
yarn add @alt-stack/server-express express zod
```

For TypeScript users:
```bash
pnpm add -D @types/express
```

## Peer Dependencies

- **express**: `^4.0.0 || ^5.0.0` - The underlying HTTP framework
- **zod**: `^4.0.0` - For schema validation and type inference

## Quick Start

```typescript
import { init, createServer, router } from "@alt-stack/server-express";
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
    createContext: (req, res) => ({
      user: getUserFromRequest(req.headers.authorization),
    }),
  }
);

// Start the server
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
```

## Features

- **Type-safe routes**: Full TypeScript inference from Zod schemas
- **Builder pattern**: Fluent API for defining routes with `.get()`, `.post()`, etc.
- **Type-safe errors**: `ctx.error()` with automatic status code inference
- **Reusable procedures**: Create middleware chains with context extension
- **Router combination**: Nest routers for modular API design
- **Validation**: Automatic Zod validation for params, query, and body
- **OpenAPI generation**: Built-in Swagger UI with `createDocsRouter()`
- **Native Express context**: Access full Express API via `ctx.express`

## Context Access

In handlers and middleware, access the Express request/response via `ctx.express`:

```typescript
.get(({ ctx }) => {
  // Access Express req/res directly
  const url = ctx.express.req.url;
  const headers = ctx.express.req.headers;
  
  // For most cases, just return data (auto-serialized to JSON)
  return { message: "Hello" };
})
```

## OpenAPI Documentation

Generate and serve OpenAPI docs:

```typescript
import { createDocsRouter, createServer } from "@alt-stack/server-express";

const docsRouter = createDocsRouter(
  { api: appRouter },
  { title: "My API", version: "1.0.0" }
);

const app = createServer({ api: appRouter });

// Mount docs router (returns native Express router)
app.use("/docs", docsRouter);
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

## Differences from Hono Adapter

| Feature | server-hono | server-express |
|---------|-------------|----------------|
| Context access | `ctx.hono` | `ctx.express.req` / `ctx.express.res` |
| DocsRouter | Returns Router | Returns Express.Router |
| Response handling | Web Response API | Express res methods |

## Related Packages

- [`@alt-stack/server-core`](../server-core/README.md) - Core types and utilities
- [`@alt-stack/server-hono`](../server-hono/README.md) - Hono adapter
- [`@alt-stack/client`](../client/README.md) - Type-safe API client

## License

MIT


# @alt-stack/server-hono

A lightweight, type-safe server framework built on [Hono](https://hono.dev/) with Zod validation. Inspired by tRPC's builder pattern, providing full type inference from a central router definition.

## Documentation

Full documentation is available at: [Server Framework Docs](./../../apps/docs/)

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
- **Result-based error handling**: Use `ok()` and `err()` for explicit error returns
- **Reusable procedures**: Create middleware chains with context extension
- **Router combination**: Nest routers for modular API design
- **Validation**: Automatic Zod validation for params, query, and body
- **OpenAPI generation**: Built-in Swagger UI with `createDocsRouter()`
- **Native Hono context**: Access full Hono API via `ctx.hono`

## Error Handling

Define your own error classes using `TaggedError` and use `ok()` / `err()` from the Result pattern:

```typescript
import { ok, err, TaggedError } from "@alt-stack/server-hono";
import { z } from "zod";

// Define your error class
class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly resourceId: string) {
    super(`Resource ${resourceId} not found`);
  }
}

const userRouter = router({
  "/users/{id}": factory.procedure
    .input({ params: z.object({ id: z.string() }) })
    .output(z.object({ id: z.string(), name: z.string() }))
    .errors({
      // Error schemas must have _tag: z.literal("...")
      404: z.object({
        _tag: z.literal("NotFoundError"),
        resourceId: z.string(),
      }),
    })
    .get(({ input }) => {
      const user = findUser(input.params.id);
      if (!user) {
        return err(new NotFoundError(input.params.id));
      }
      return ok(user);
    }),
});
```

### Error Schema Requirements

Error schemas **must** include a `_tag` field with a `z.literal()` value:

```typescript
// ✅ Valid
.errors({
  404: z.object({
    _tag: z.literal("NotFoundError"),
    resourceId: z.string(),
  }),
})

// ❌ Invalid - compile error (missing _tag)
.errors({
  404: z.object({ message: z.string() }),
})

// ❌ Invalid - compile error (_tag is string, not literal)
.errors({
  404: z.object({ _tag: z.string(), message: z.string() }),
})
```

See [`@alt-stack/result`](../result/README.md) for full Result type documentation.

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
| `z.string()` | Yes |
| `z.enum(["a", "b"])` | Yes |
| `z.coerce.number()` | Yes |
| `z.string().transform(...)` | Yes |
| `z.number()` | No (compile error) |
| `z.boolean()` | No (compile error) |

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

- [`@alt-stack/result`](../result/README.md) - Result type for error handling
- [`@alt-stack/server-core`](../server-core/README.md) - Core types and utilities
- [`@alt-stack/server-express`](../server-express/README.md) - Express adapter
- [`@alt-stack/http-client-fetch`](../http-client-fetch/README.md) - Type-safe API client (fetch)
- [`@alt-stack/http-client-ky`](../http-client-ky/README.md) - Type-safe API client (ky)

## License

MIT

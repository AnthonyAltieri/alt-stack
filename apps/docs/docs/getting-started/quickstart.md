# Quickstart

Get started with a simple example that demonstrates the core concepts.

## Basic Example

```typescript
import { init, createServer } from "@alt-stack/server";
import { z } from "zod";

const factory = init();
const router = factory.router()
  .get("/users/{id}", {
    input: {
      params: z.object({
        id: z.string(),
      }),
    },
    output: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email(),
    }),
  })
  .handler((ctx) => {
    // ctx.input.id is typed as string (from params)
    return {
      id: ctx.input.id,
      name: "Alice",
      email: "alice@example.com",
    };
  })
  .post("/users", {
    input: {
      body: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
    },
    output: z.object({
      id: z.string(),
      name: z.string(),
    }),
  })
  .handler((ctx) => {
    // ctx.input.name and ctx.input.email are typed (from body)
    return {
      id: "1",
      name: ctx.input.name,
    };
  });

const app = createServer({
  api: router,
});

// Use with your favorite Hono adapter
export default app;
```

This example shows:
- Type-safe route definitions with Zod schemas
- Automatic input validation from params, query, and body
- Type inference in handlers
- Combining routes into a server


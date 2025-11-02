# Combining Routers

Organize your API by combining multiple routers in `createServer`. The object keys become path prefixes.

## Basic Router Combination

```typescript
import { createRouter, createServer } from "@repo/server";
import { z } from "zod";

// User routes
const userRouter = createRouter()
  .get("/{id}", {
    input: {
      params: z.object({
        id: z.string(),
      }),
    },
    output: z.object({
      id: z.string(),
      name: z.string(),
    }),
  })
  .handler((ctx) => {
    return { id: ctx.input.id, name: "Alice" };
  })
  .post("/", {
    input: {
      body: z.object({
        name: z.string(),
      }),
    },
    output: z.object({
      id: z.string(),
    }),
  })
  .handler((ctx) => {
    return { id: "1" };
  });

// Post routes
const postsRouter = createRouter()
  .get("/", {
    input: {},
    output: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
      })
    ),
  })
  .handler(() => {
    return [{ id: "1", title: "Hello World" }];
  });

// Combine routers - keys become path prefixes
const app = createServer({
  users: userRouter,  // Routes prefixed with /users
  posts: postsRouter, // Routes prefixed with /posts
});

// Routes available at:
// - GET /users/{id}
// - POST /users
// - GET /posts
```

## Multiple Routers with Same Prefix

You can pass arrays of routers for the same prefix:

```typescript
const app = createServer({
  api: [v1Router, v2Router], // Both routers prefixed with /api
});
```

This is useful for versioning APIs or organizing routes by feature.

## Nested Routes

The path prefix system allows natural nesting:

```typescript
const app = createServer({
  api: {
    v1: v1Router,
    v2: v2Router,
  },
  admin: adminRouter,
});
```

Results in routes like:
- `/api/v1/*` - All v1Router routes
- `/api/v2/*` - All v2Router routes
- `/admin/*` - All adminRouter routes


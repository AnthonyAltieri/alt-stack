# Combining Routers

Organize your API by combining multiple routers using the new tRPC-style `router()` function. Routers can be nested, and paths combine automatically.

## Basic Router Combination

```typescript
import { router, publicProcedure, createServer } from "@alt-stack/server-hono";
import { z } from "zod";

// User routes
const userRouter = router({
  "{id}": publicProcedure
    .input({
      params: z.object({
        id: z.string(),
      }),
    })
    .output(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .get((opts) => {
      const { input } = opts;
      return { id: input.id, name: "Alice" };
    }),

  create: publicProcedure
    .input({
      body: z.object({
        name: z.string(),
      }),
    })
    .output(
      z.object({
        id: z.string(),
      })
    )
    .post((opts) => {
      return { id: "1" };
    }),
});

// Post routes
const postsRouter = router({
  list: publicProcedure
    .output(
      z.array(
        z.object({
          id: z.string(),
          title: z.string(),
        })
      )
    )
    .get(() => {
      return [{ id: "1", title: "Hello World" }];
    }),
});

// Combine routers - keys become path prefixes
const appRouter = router({
  users: userRouter,  // Routes prefixed with /users
  posts: postsRouter, // Routes prefixed with /posts
});

const app = createServer({
  api: appRouter,
});

// Routes available at:
// - GET /api/users/{id}
// - POST /api/users/create
// - GET /api/posts/list
```

## Nested Routers

Routers can be nested within other routers. Paths combine automatically:

```typescript
import { router, publicProcedure } from "@alt-stack/server-hono";

const productRouter = router({
  "favorites/me": publicProcedure.get(() => {
    return [];
  }),
});

const userRouter = router({
  profile: publicProcedure.get(() => {
    return { id: "1" };
  }),
});

// Nested routers
const appRouter = router({
  products: productRouter,  // /products/favorites/me
  users: userRouter,        // /users/profile
});

// Final paths:
// - GET /products/favorites/me
// - GET /users/profile
```

## Multiple Routers with Same Prefix

You can pass arrays of routers for the same prefix in `createServer`:

```typescript
import { router, publicProcedure, createServer } from "@alt-stack/server-hono";

const v1Router = router({
  users: publicProcedure.get(() => []),
});

const v2Router = router({
  users: publicProcedure.get(() => []),
});

const app = createServer({
  api: [v1Router, v2Router], // Both routers prefixed with /api
});
```

This is useful for versioning APIs or organizing routes by feature.

## Nested Routes with Compound Paths

To achieve nested routes like `/api/v1/*` and `/api/v2/*`, use compound prefixes in `createServer`:

```typescript
import { router, publicProcedure, createServer } from "@alt-stack/server-hono";

const v1Router = router({
  users: publicProcedure.get(() => []),
});

const v2Router = router({
  users: publicProcedure.get(() => []),
});

const adminRouter = router({
  settings: publicProcedure.get(() => []),
});

const app = createServer({
  "api/v1": v1Router,
  "api/v2": v2Router,
  admin: adminRouter,
});
```

Results in routes like:
- `/api/v1/users` - All v1Router routes
- `/api/v2/users` - All v2Router routes
- `/admin/settings` - All adminRouter routes

## Router-Level Middleware

You can apply middleware to entire routers:

```typescript
import { router, publicProcedure, createMiddleware } from "@alt-stack/server-hono";

const authMiddleware = createMiddleware(async ({ ctx, next }) => {
  // Auth logic
  return next();
});

const userRouter = router({
  profile: publicProcedure.get(() => ({ id: "1" })),
}).use(authMiddleware);

const postRouter = router({
  list: publicProcedure.get(() => []),
});

// Combine routers
const appRouter = router({
  users: userRouter,  // Has auth middleware
  posts: postRouter,  // No auth middleware
});
```

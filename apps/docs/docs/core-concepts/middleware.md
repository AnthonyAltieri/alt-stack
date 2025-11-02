# Middleware

Apply middleware at router-level or procedure-level to add cross-cutting concerns like authentication, logging, or rate limiting.

## Router-Level Middleware

Apply middleware to all routes in a router. Use `createMiddleware` helper to ensure proper context typing:

```typescript
import { createRouter, createServer, createMiddleware } from "@repo/server";
import { z } from "zod";

interface AppContext {
  user: User | null;
}

const authMiddleware = createMiddleware<AppContext>(async ({ ctx, next }) => {
  // ctx is automatically typed as BaseContext & AppContext
  const user = await authenticate(ctx.hono.req);
  if (!user) {
    return ctx.hono.json({ error: "Unauthorized" }, 401);
  }
  // Extend context with user
  return next({ ctx: { user } });
});

const router = createRouter<AppContext>()
  .use(authMiddleware)
  .get("/profile", {
    input: {},
    output: z.object({
      id: z.string(),
      name: z.string(),
    }),
  })
  .handler((ctx) => {
    // ctx.user is typed (from authMiddleware)
    return {
      id: ctx.user.id,
      name: ctx.user.name,
    };
  });

const app = createServer({
  users: router,
});
```

## Procedure-Level Middleware

Apply middleware to specific routes:

```typescript
const router = createRouter()
  .post("/users", {
    input: {
      body: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
    },
    output: z.object({
      id: z.string(),
    }),
  })
  .use(async ({ ctx, next }) => {
    // Log before handler
    console.log("Creating user:", ctx.input.name);
    return next();
  })
  .handler((ctx) => {
    return { id: "1" };
  });
```

## Context Extension

Middleware can extend the context by passing updated context to `next()`:

```typescript
const loggerMiddleware = createMiddleware<AppContext>(async ({ ctx, next }) => {
  const start = Date.now();
  const result = await next();
  const duration = Date.now() - start;
  console.log(`Request took ${duration}ms`);
  return result;
});

const authMiddleware = createMiddleware<AppContext>(async ({ ctx, next }) => {
  const user = await authenticate(ctx.hono.req);
  if (!user) {
    return ctx.hono.json({ error: "Unauthorized" }, 401);
  }
  // Extend context - user is now non-null in subsequent handlers
  return next({ ctx: { user } });
});
```

## Multiple Middleware

Chain multiple middleware on the same router or procedure:

```typescript
const router = createRouter<AppContext>()
  .use(loggerMiddleware)
  .use(authMiddleware)
  .get("/profile", { /* ... */ })
  .handler(/* ... */);
```

Middleware executes in the order they're defined.

## Reusable Procedures

Create reusable procedures with middleware to reuse authentication or other middleware across multiple routes. See the [Reusable Procedures guide](/docs/core-concepts/reusable-procedures) for details:

```typescript
const router = createRouter<AppContext>();

// Create reusable procedures
const publicProcedure = router.procedure;
const protectedProcedure = router.procedure.use(async (opts) => {
  // Auth middleware
  if (!opts.ctx.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  return opts.next({ ctx: { user: opts.ctx.user } });
});

// Use procedures
publicProcedure.get("/hello", { input: {}, output: z.string() }).handler(() => "hello");
protectedProcedure.get("/profile", { input: {}, output: UserSchema }).handler((ctx) => ctx.user!);
```


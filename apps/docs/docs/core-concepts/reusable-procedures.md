# Reusable Procedures

Create reusable procedures with middleware to follow the tRPC pattern. This allows you to define common authentication, validation, or other middleware once and reuse it across multiple routes.

## Basic Pattern

Use `router.procedure` to create a base procedure that can be extended with middleware:

```typescript
import { createRouter, createServer } from "@repo/server";
import { z } from "zod";

interface AppContext {
  user: { id: string; name: string } | null;
}

const router = createRouter<AppContext>();

// Create a reusable public procedure (no middleware)
const publicProcedure = router.procedure;

// Create a reusable protected procedure with auth middleware
const protectedProcedure = router.procedure.use(
  async function isAuthed(opts) {
    const { ctx } = opts;
    // `ctx.user` is nullable
    if (!ctx.user) {
      throw ctx.error({
        error: {
          code: "UNAUTHORIZED" as const,
          message: "Authentication required",
        },
      });
    }
    // ✅ Pass updated context where user is non-null
    return opts.next({
      ctx: {
        user: ctx.user, // ✅ user value is known to be non-null now
      },
    });
  }
);

// Use procedures to create routes
publicProcedure
  .get("/hello", {
    input: {},
    output: z.string(),
  })
  .handler(() => {
    return "hello world";
  });

protectedProcedure
  .get("/profile", {
    input: {},
    output: z.object({
      id: z.string(),
      name: z.string(),
    }),
  })
  .handler((ctx) => {
    // ctx.user is guaranteed to be non-null after middleware
    return {
      id: ctx.user!.id,
      name: ctx.user!.name,
    };
  });

protectedProcedure
  .get("/secret", {
    input: {},
    output: z.object({
      secret: z.string(),
    }),
  })
  .handler(() => {
    return { secret: "sauce" };
  });
```

## With init() Pattern

You can also use the `init()` function to create procedures:

```typescript
import { init, createServer } from "@repo/server";

const t = init<AppContext>();

// Create reusable procedures
const publicProcedure = t.router().procedure;
const protectedProcedure = t.router().procedure.use(authMiddleware);

// Use procedures to create routes
const router = t.router();
protectedProcedure.get("/secret", { input: {}, output: z.string() }).handler(...);
```

## Configuring Procedures

Procedures support the same configuration methods as regular routes:

### Setting Default Input

```typescript
const validatedProcedure = router.procedure.input({
  query: z.object({
    apiKey: z.string().min(1),
  }),
});

// All routes using this procedure will require apiKey in query
validatedProcedure
  .get("/data", {
    input: {
      body: z.object({ filter: z.string() }), // Additional input
    },
    output: z.array(z.any()),
  })
  .handler((ctx) => {
    // ctx.input.apiKey is available (from procedure)
    // ctx.input.filter is available (from route)
    return [];
  });
```

### Setting Default Output

```typescript
const jsonProcedure = router.procedure.output(
  z.object({
    success: z.boolean(),
  })
);

jsonProcedure
  .post("/action", {
    input: {
      body: z.object({ action: z.string() }),
    },
    // output is automatically set from procedure
  })
  .handler(() => {
    return { success: true };
  });
```

### Setting Default Errors

```typescript
const errorProcedure = router.procedure.errors({
  401: z.object({
    error: z.object({
      code: z.literal("UNAUTHORIZED"),
      message: z.string(),
    }),
  }),
});

errorProcedure
  .get("/protected", {
    input: {},
    output: z.string(),
    // errors are automatically set from procedure
  })
  .handler((ctx) => {
    if (someCondition) {
      throw ctx.error({
        error: {
          code: "UNAUTHORIZED",
          message: "Not authorized",
        },
      });
    }
    return "success";
  });
```

## Chaining Middleware

You can chain multiple middleware on procedures:

```typescript
const loggedProcedure = router.procedure.use(async (opts) => {
  console.log("Request started");
  return opts.next();
});

const authenticatedProcedure = loggedProcedure.use(async (opts) => {
  if (!opts.ctx.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  return opts.next({ ctx: { user: opts.ctx.user } });
});
```

## Combining Configuration and Middleware

You can combine configuration methods with middleware:

```typescript
const apiProcedure = router.procedure
  .input({
    query: z.object({
      version: z.string(),
    }),
  })
  .use(async (opts) => {
    // Validate API version
    if (opts.ctx.input.version !== "v1") {
      return new Response("Unsupported version", { status: 400 });
    }
    return opts.next();
  });
```

## Context Narrowing

When middleware calls `next({ ctx: {...} })`, the context is updated at runtime. TypeScript cannot fully track this narrowing through function calls, but the runtime behavior is correct:

```typescript
const protectedProcedure = router.procedure.use(
  async function isAuthed(opts) {
    const { ctx } = opts;
    if (!ctx.user) {
      throw ctx.error({
        error: {
          code: "UNAUTHORIZED" as const,
          message: "Authentication required",
        },
      });
    }
    // Runtime: ctx.user is now non-null
    return opts.next({
      ctx: {
        user: ctx.user,
      },
    });
  }
);

protectedProcedure
  .get("/profile", {
    input: {},
    output: z.object({ id: z.string() }),
  })
  .handler((ctx) => {
    // Runtime: ctx.user is non-null
    // TypeScript: may need type assertion or null check for full type safety
    if (!ctx.user) {
      // This should never happen at runtime due to middleware
      throw ctx.error({
        error: {
          code: "UNAUTHORIZED" as const,
          message: "Authentication required",
        },
      });
    }
    return { id: ctx.user.id };
  });
```

## Common Patterns

### Public and Protected Routes

```typescript
const router = createRouter<AppContext>();

const publicProcedure = router.procedure;
const protectedProcedure = router.procedure.use(authMiddleware);

// Public route
publicProcedure.get("/hello", { input: {}, output: z.string() }).handler(() => "hello");

// Protected route
protectedProcedure.get("/profile", { input: {}, output: UserSchema }).handler((ctx) => {
  return ctx.user!; // Non-null due to middleware
});
```

### Role-Based Procedures

```typescript
const requireRole = (role: string) =>
  router.procedure.use(async (opts) => {
    if (!opts.ctx.user || opts.ctx.user.role !== role) {
      return new Response("Forbidden", { status: 403 });
    }
    return opts.next();
  });

const adminProcedure = requireRole("admin");
const moderatorProcedure = requireRole("moderator");
```

### Rate Limited Procedures

```typescript
const rateLimitedProcedure = router.procedure.use(async (opts) => {
  const rateLimitKey = getRateLimitKey(opts.ctx);
  if (await isRateLimited(rateLimitKey)) {
    return new Response("Too many requests", { status: 429 });
  }
  await incrementRateLimit(rateLimitKey);
  return opts.next();
});
```


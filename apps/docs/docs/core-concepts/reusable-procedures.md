# Reusable Procedures

Create reusable procedures with middleware to follow the tRPC pattern. This allows you to define common authentication, validation, or other middleware once and reuse it across multiple routes.

## Basic Pattern

Use `publicProcedure` or `init()` to create procedures:

```typescript
import { router, publicProcedure, init } from "@alt-stack/server";
import { z } from "zod";

interface AppContext {
  user: { id: string; name: string } | null;
}

const factory = init<AppContext>();

// Create reusable procedures
const publicProc = publicProcedure;
const protectedProcedure = factory.procedure
  .errors({
    401: z.object({
      error: z.object({
        code: z.literal("UNAUTHORIZED"),
        message: z.string(),
      }),
    }),
  })
  .use(async function isAuthed(opts) {
    const { ctx, next } = opts;
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
    return next({
      ctx: {
        user: ctx.user, // ✅ user value is known to be non-null now
      },
    });
  });

// Create a router using the new tRPC-style API
export const appRouter = router({
  hello: publicProc.get(() => {
    return "hello world";
  }),

  profile: protectedProcedure
    .input({})
    .output(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .get((opts) => {
      // opts.ctx.user is guaranteed to be non-null after middleware
      const { ctx } = opts;
      return {
        id: ctx.user!.id,
        name: ctx.user!.name,
      };
    }),

  secret: protectedProcedure
    .input({})
    .output(
      z.object({
        secret: z.string(),
      })
    )
    .get(() => {
      return { secret: "sauce" };
    }),
});
```

## Configuring Procedures

Procedures support the same configuration methods as regular routes:

### Setting Default Input

```typescript
import { router, publicProcedure } from "@alt-stack/server";
import { z } from "zod";

const validatedProcedure = publicProcedure.input({
  query: z.object({
    apiKey: z.string().min(1),
  }),
});

// All routes using this procedure will require apiKey in query
export const dataRouter = router({
  list: validatedProcedure
    .input({
      body: z.object({ filter: z.string() }), // Additional input
    })
    .get((opts) => {
      // opts.input.apiKey is available (from procedure)
      // opts.input.filter is available (from route)
      const { input } = opts;
      return [];
    }),
});
```

### Setting Default Output

```typescript
import { router, publicProcedure } from "@alt-stack/server";
import { z } from "zod";

const jsonProcedure = publicProcedure.output(
  z.object({
    success: z.boolean(),
  })
);

export const actionRouter = router({
  create: jsonProcedure
    .input({
      body: z.object({ action: z.string() }),
    })
    .post((opts) => {
      // output is automatically set from procedure
      return { success: true };
    }),
});
```

### Setting Default Errors

```typescript
import { router, publicProcedure } from "@alt-stack/server";
import { z } from "zod";

const errorProcedure = publicProcedure.errors({
  401: z.object({
    error: z.object({
      code: z.literal("UNAUTHORIZED"),
      message: z.string(),
    }),
  }),
});

export const protectedRouter = router({
  data: errorProcedure
    .input({})
    .output(z.string())
    .get((opts) => {
      const { ctx } = opts;
      if (someCondition) {
        throw ctx.error({
          error: {
            code: "UNAUTHORIZED",
            message: "Not authorized",
          },
        });
      }
      return "success";
    }),
});
```

### Combining Procedure and Route Errors

Errors defined on procedures are automatically merged with errors defined on routes. Route errors take precedence when the same status code is defined in both:

```typescript
import { router, publicProcedure } from "@alt-stack/server";
import { z } from "zod";

// Procedure defines common authentication error
const apiProcedure = publicProcedure.errors({
  401: z.object({
    error: z.object({
      code: z.literal("UNAUTHORIZED"),
      message: z.string(),
    }),
  }),
});

export const userRouter = router({
  "{id}": apiProcedure
    .input({
      params: z.object({ id: z.string() }),
    })
    .output(z.object({ id: z.string(), name: z.string() }))
    .errors({
      // 401 is inherited from procedure
      // Add additional route-specific errors
      404: z.object({
        error: z.object({
          code: z.literal("NOT_FOUND"),
          message: z.string(),
        }),
      }),
      403: z.object({
        error: z.object({
          code: z.literal("FORBIDDEN"),
          message: z.string(),
        }),
      }),
    })
    .get((opts) => {
      const { input, ctx } = opts;
      const user = findUser(input.id);

      if (!user) {
        // Can throw 404 error (defined on route)
        throw ctx.error({
          error: {
            code: "NOT_FOUND",
            message: "User not found",
          },
        });
      }

      if (!canAccessUser(user)) {
        // Can throw 403 error (defined on route)
        throw ctx.error({
          error: {
            code: "FORBIDDEN",
            message: "Access denied",
          },
        });
      }

      if (!isAuthenticated()) {
        // Can throw 401 error (inherited from procedure)
        throw ctx.error({
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        });
      }

      return user;
    }),
});
```

In this example, the route has access to all three error types:
- `401 UNAUTHORIZED` from the procedure
- `404 NOT_FOUND` from the route
- `403 FORBIDDEN` from the route

**Union of Error Schemas**: If both the procedure and route define an error with the same status code, the schemas are unioned. This means `ctx.error()` can accept either schema for that status code:

```typescript
const apiProcedure = publicProcedure.errors({
  401: z.object({
    error: z.object({
      code: z.literal("UNAUTHORIZED"),
      message: z.string(),
    }),
  }),
});

export const settingsRouter = router({
  me: apiProcedure
    .input({})
    .errors({
      // Route defines a different 401 error schema - they will be unioned
      401: z.object({
        error: z.object({
          code: z.literal("SESSION_EXPIRED"),
          message: z.string(),
          redirect: z.string().url(),
        }),
      }),
    })
    .get((opts) => {
      const { ctx } = opts;
      // Can throw 401 with either UNAUTHORIZED or SESSION_EXPIRED
      throw ctx.error({
        error: {
          code: "SESSION_EXPIRED",
          message: "Your session has expired",
          redirect: "https://example.com/login",
        },
      });
    }),
});
```

## Middleware Chaining

Middleware can be chained to build up context:

```typescript
import { router, publicProcedure } from "@alt-stack/server";
import { z } from "zod";

interface AppContext {
  user: { id: string; role: string } | null;
}

const factory = init<AppContext>();

const authProcedure = factory.procedure.use(async (opts) => {
  const { ctx, next } = opts;
  const user = await getUser(ctx);
  if (!user) {
    throw ctx.error({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { user } });
});

const adminProcedure = authProcedure.use(async (opts) => {
  const { ctx, next } = opts;
  if (ctx.user.role !== "admin") {
    throw ctx.error({ code: "FORBIDDEN" });
  }
  return next({ ctx: { isAdmin: true } });
});

export const adminRouter = router({
  settings: adminProcedure
    .input({})
    .get((opts) => {
      // opts.ctx.user and opts.ctx.isAdmin are both available
      const { ctx } = opts;
      return { admin: ctx.isAdmin };
    }),
});
```

## Common Patterns

### Public and Protected Routes

```typescript
import { router, publicProcedure, init } from "@alt-stack/server";
import { z } from "zod";

interface AppContext {
  user: { id: string; name: string } | null;
}

const factory = init<AppContext>();

const publicProc = publicProcedure;
const protectedProcedure = factory.procedure.use(authMiddleware);

export const appRouter = router({
  hello: publicProc.get(() => "hello"),

  profile: protectedProcedure
    .input({})
    .get((opts) => {
      return opts.ctx.user!; // Non-null due to middleware
    }),
});
```

### Role-Based Procedures

```typescript
import { router, publicProcedure, init } from "@alt-stack/server";

interface AppContext {
  user: { role: string } | null;
}

const factory = init<AppContext>();

const requireRole = (role: string) =>
  factory.procedure.use(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== role) {
      return new Response("Forbidden", { status: 403 });
    }
    return next();
  });

const adminProcedure = requireRole("admin");
const moderatorProcedure = requireRole("moderator");

export const adminRouter = router({
  delete: adminProcedure.get(() => ({ success: true })),
});

export const moderatorRouter = router({
  moderate: moderatorProcedure.post(() => ({ success: true })),
});
```

### Rate Limited Procedures

```typescript
import { router, publicProcedure } from "@alt-stack/server";

const rateLimitedProcedure = publicProcedure.use(async (opts) => {
  const { ctx, next } = opts;
  const rateLimitKey = getRateLimitKey(ctx);
  if (await isRateLimited(rateLimitKey)) {
    return new Response("Too many requests", { status: 429 });
  }
  await incrementRateLimit(rateLimitKey);
  return next();
});

export const apiRouter = router({
  data: rateLimitedProcedure.get(() => {
    return { data: [] };
  }),
});
```

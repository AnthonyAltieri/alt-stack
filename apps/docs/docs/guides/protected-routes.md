# Protected Routes

Follow the tRPC authorization pattern for type-safe protected routes. The middleware can pass an updated context to `next()` to narrow types.

## Reusable Procedures Pattern (Recommended)

The recommended way to create protected routes is using reusable procedures:

```typescript
import { createRouter, createServer } from "@repo/server";
import { z } from "zod";

interface AppContext {
  user: { id: string; name: string } | null;
}

const router = createRouter<AppContext>();

// Create reusable procedures
const publicProcedure = router.procedure;
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
    return opts.next({
      ctx: {
        user: ctx.user,
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
  .handler(() => "hello world");

protectedProcedure
  .get("/secret", {
    input: {},
    output: z.object({
      secret: z.string(),
    }),
  })
  .handler(() => ({
    secret: "sauce",
  }));

const app = createServer({ api: router });
```

See the [Reusable Procedures guide](/docs/core-concepts/reusable-procedures) for more details.

## Procedure-Level Middleware Pattern

The middleware can narrow the context type by passing an updated context to `next()`:

```typescript
import { createRouter } from "@repo/server";
import { z } from "zod";

const protectedRouter = createRouter<AppContext>();

// You can reuse this middleware pattern for any procedure
protectedRouter
  .get("/profile", {
    input: {},
    output: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
    }),
    errors: {
      401: z.object({
        error: z.object({
          code: z.literal("UNAUTHORIZED"),
          message: z.string(),
        }),
      }),
    },
  })
  .use(async function isAuthed(opts) {
    const { ctx } = opts;
    // `ctx.user` is nullable
    if (!ctx.user) {
      throw opts.ctx.error({
        error: {
          code: "UNAUTHORIZED" as const,
          message: "Authentication required",
        },
      });
    }
    // ✅ Pass updated context where user is non-null (tRPC pattern)
    // This allows the context to have user as non-null for subsequent handlers
    return opts.next({
      ctx: {
        user: ctx.user, // ✅ user value is known to be non-null now
      },
    });
  })
  .handler((ctx) => {
    // ✅ ctx.user is now guaranteed to be non-null after the middleware
    // The next({ ctx: { user: ... } }) pattern ensures the runtime context has user
    // Type check needed because TypeScript can't track the narrowing through next()
    if (!ctx.user) {
      // This should never happen due to middleware, but TypeScript needs the check
      throw ctx.error({
        error: {
          code: "UNAUTHORIZED" as const,
          message: "Authentication required",
        },
      });
    }
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
    };
  });
```

## Traditional Middleware Pattern

You can also use a traditional middleware approach without the context narrowing. Use `createMiddleware` helper to avoid type assertions:

```typescript
import { createMiddleware } from "@repo/server";

// Middleware that requires authentication - no type assertion needed!
const requireAuth = createMiddleware<AppContext>(async ({ ctx, next }) => {
  // ctx is automatically typed as BaseContext & AppContext
  if (!ctx.user) {
    return ctx.hono.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      401
    ) as Response;
  }
  return next();
});

// Use on router level (protects all routes)
const protectedRouter = createRouter<AppContext>()
  .use(requireAuth)
  .get("/profile", {
    input: {},
    output: z.object({
      id: z.string(),
      email: z.string(),
    }),
  })
  .handler((ctx) => {
    // Additional null check recommended for type safety
    if (!ctx.user) {
      throw ctx.error({
        error: {
          code: "UNAUTHORIZED" as const,
          message: "Authentication required",
        },
      });
    }
    
    return {
      id: ctx.user.id,
      email: ctx.user.email,
    };
  });

// Or use on procedure level (protects specific routes)
const router = createRouter<AppContext>()
  .get("/public", {
    input: {},
    output: z.object({ message: z.string() }),
  })
  .handler(() => {
    return { message: "Public content" };
  })
  .get("/private", {
    input: {},
    output: z.object({
      id: z.string(),
      email: z.string(),
    }),
  })
  .use(requireAuth) // Protect only this route
  .handler((ctx) => {
    if (!ctx.user) {
      throw ctx.error({
        error: {
          code: "UNAUTHORIZED" as const,
          message: "Authentication required",
        },
      });
    }
    
    return {
      id: ctx.user.id,
      email: ctx.user.email,
    };
  });
```

## Type-Safe User Context with Zod

For better type safety, use Zod's type inference to create authenticated context types:

```typescript
import { z } from "zod";

// Your validated user schema
const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
});

type User = z.infer<typeof UserSchema>;

interface AppContext extends Record<string, unknown> {
  user: User | null;
}

interface AuthenticatedContext extends AppContext {
  user: User; // Non-nullable after requireAuth middleware
}

const requireAuth = async ({ ctx, next }): Promise<AuthenticatedContext | Response> => {
  const appCtx = ctx as typeof ctx & AppContext;
  
  // Validate user with Zod if not already validated
  if (!appCtx.user) {
    return appCtx.hono.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      401
    ) as Response;
  }
  
  // Optionally re-validate to ensure type safety
  const validatedUser = UserSchema.parse(appCtx.user);
  
  // Return context with validated, non-nullable user
  return next() as Promise<AuthenticatedContext>;
};
```

## Role-Based Access Control

You can also validate user roles, permissions, or other attributes using Zod:

```typescript
import { z } from "zod";

const UserWithRoleSchema = UserSchema.extend({
  role: z.enum(["admin", "user", "moderator"]),
  permissions: z.array(z.string()),
});

type UserWithRole = z.infer<typeof UserWithRoleSchema>;

// Middleware that requires specific role
const requireRole = (role: "admin" | "user" | "moderator") => {
  return async ({ ctx, next }) => {
    const appCtx = ctx as typeof ctx & AppContext;
    
    if (!appCtx.user) {
      return appCtx.hono.json({ error: "Unauthorized" }, 401) as Response;
    }
    
    // Validate user has required role
    const validatedUser = UserWithRoleSchema.safeParse(appCtx.user);
    if (!validatedUser.success || validatedUser.data.role !== role) {
      return appCtx.hono.json({ error: "Forbidden" }, 403) as Response;
    }
    
    return next();
  };
};

// Usage
const adminRouter = createRouter<AppContext>()
  .use(requireRole("admin"))
  .get("/admin/users", {
    input: {},
    output: z.array(UserSchema),
  })
  .handler(async (ctx) => {
    // ctx.user is validated as admin
    return getAllUsers();
  });
```


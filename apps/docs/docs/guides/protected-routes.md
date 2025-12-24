# Protected Routes

Follow the tRPC authorization pattern for type-safe protected routes. The middleware can pass an updated context to `next()` to narrow types.

## Reusable Procedures Pattern (Recommended)

The recommended way to create protected routes is using reusable procedures with the Result pattern:

```typescript
import { router, publicProcedure, init, createServer, ok, err, TaggedError } from "@alt-stack/server-hono";
import { z } from "zod";

interface AppContext {
  user: { id: string; name: string } | null;
}

// Error class
class UnauthorizedError extends TaggedError {
  readonly _tag = "UnauthorizedError" as const;
  constructor(public readonly message: string = "Authentication required") {
    super(message);
  }
}

const UnauthorizedErrorSchema = z.object({
  _tag: z.literal("UnauthorizedError"),
  message: z.string(),
});

const factory = init<AppContext>();

// Create reusable procedures
const publicProc = publicProcedure;
const protectedProcedure = factory.procedure
  .errors({
    401: UnauthorizedErrorSchema,
  })
  .use(async function isAuthed(opts) {
    const { ctx, next } = opts;
    if (!ctx.user) {
      return err(new UnauthorizedError("Authentication required"));
    }
    return next({
      ctx: {
        user: ctx.user,
      },
    });
  });

// Use procedures to create routes
export const appRouter = router({
  hello: publicProc.get(() => ok("hello world")),

  secret: protectedProcedure
    .input({})
    .output(
      z.object({
        secret: z.string(),
      })
    )
    .get(() => ok({
      secret: "sauce",
    })),
});

const app = createServer({ api: appRouter });
```

See the [Reusable Procedures guide](/core-concepts/reusable-procedures) for more details.

## Procedure-Level Middleware Pattern

The middleware can narrow the context type by passing an updated context to `next()`:

```typescript
import { router, publicProcedure, init, ok, err, TaggedError } from "@alt-stack/server-hono";
import { z } from "zod";

interface AppContext {
  user: { id: string; email: string; name: string } | null;
}

class UnauthorizedError extends TaggedError {
  readonly _tag = "UnauthorizedError" as const;
  constructor(public readonly message: string = "Authentication required") {
    super(message);
  }
}

const UnauthorizedErrorSchema = z.object({
  _tag: z.literal("UnauthorizedError"),
  message: z.string(),
});

const factory = init<AppContext>();

export const protectedRouter = router({
  profile: factory.procedure
    .input({})
    .output(
      z.object({
        id: z.string(),
        email: z.string(),
        name: z.string(),
      })
    )
    .errors({
      401: UnauthorizedErrorSchema,
    })
    .use(async function isAuthed(opts) {
      const { ctx, next } = opts;
      // `ctx.user` is nullable
      if (!ctx.user) {
        return err(new UnauthorizedError("Authentication required"));
      }
      // ✅ Pass updated context where user is non-null (tRPC pattern)
      // This allows the context to have user as non-null for subsequent handlers
      return next({
        ctx: {
          user: ctx.user, // ✅ user value is known to be non-null now
        },
      });
    })
    .get((opts) => {
      // ✅ opts.ctx.user is now guaranteed to be non-null after the middleware
      const { ctx } = opts;
      return ok({
        id: ctx.user!.id,
        email: ctx.user!.email,
        name: ctx.user!.name,
      });
    }),
});
```

## Mixed Public and Protected Routes

You can mix public and protected routes in the same router:

```typescript
import { router, publicProcedure, init, ok, err, TaggedError } from "@alt-stack/server-hono";
import { z } from "zod";

interface AppContext {
  user: { id: string; email: string } | null;
}

class UnauthorizedError extends TaggedError {
  readonly _tag = "UnauthorizedError" as const;
  constructor(public readonly message: string = "Authentication required") {
    super(message);
  }
}

const UnauthorizedErrorSchema = z.object({
  _tag: z.literal("UnauthorizedError"),
  message: z.string(),
});

const factory = init<AppContext>();

const publicProc = publicProcedure;
const protectedProcedure = factory.procedure
  .errors({ 401: UnauthorizedErrorSchema })
  .use(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user) {
      return err(new UnauthorizedError());
    }
    return next({ ctx: { user: ctx.user } });
  });

export const appRouter = router({
  public: publicProc.get(() => ok({ message: "Public content" })),

  private: protectedProcedure
    .input({})
    .output(
      z.object({
        id: z.string(),
        email: z.string(),
      })
    )
    .get((opts) => {
      const { ctx } = opts;
      return ok({
        id: ctx.user!.id,
        email: ctx.user!.email,
      });
    }),
});
```

## Role-Based Access Control

You can validate user roles, permissions, or other attributes:

```typescript
import { router, publicProcedure, init, ok, err, TaggedError } from "@alt-stack/server-hono";
import { z } from "zod";

interface AppContext {
  user: { id: string; role: string; permissions: string[] } | null;
}

class UnauthorizedError extends TaggedError {
  readonly _tag = "UnauthorizedError" as const;
  constructor(public readonly message: string = "Authentication required") {
    super(message);
  }
}

class ForbiddenError extends TaggedError {
  readonly _tag = "ForbiddenError" as const;
  constructor(public readonly message: string = "Access denied") {
    super(message);
  }
}

const UnauthorizedErrorSchema = z.object({
  _tag: z.literal("UnauthorizedError"),
  message: z.string(),
});

const ForbiddenErrorSchema = z.object({
  _tag: z.literal("ForbiddenError"),
  message: z.string(),
});

const factory = init<AppContext>();

// Middleware that requires specific role
const requireRole = (role: "admin" | "user" | "moderator") => {
  return factory.procedure
    .errors({ 401: UnauthorizedErrorSchema, 403: ForbiddenErrorSchema })
    .use(async (opts) => {
      const { ctx, next } = opts;
      if (!ctx.user) {
        return err(new UnauthorizedError());
      }
      if (ctx.user.role !== role) {
        return err(new ForbiddenError(`Requires ${role} role`));
      }
      return next({ ctx: { user: ctx.user } });
    });
};

const adminProcedure = requireRole("admin");
const moderatorProcedure = requireRole("moderator");

export const adminRouter = router({
  users: adminProcedure
    .input({})
    .output(z.array(z.object({ id: z.string(), name: z.string() })))
    .get(() => {
      return ok(getAllUsers());
    }),
});

export const moderatorRouter = router({
  moderate: moderatorProcedure
    .input({
      body: z.object({ action: z.string() }),
    })
    .post(() => {
      return ok({ success: true });
    }),
});
```

## Type-Safe User Context

For better type safety, use Zod's type inference to create authenticated context types:

```typescript
import { router, publicProcedure, init, ok, err, TaggedError } from "@alt-stack/server-hono";
import { z } from "zod";

// Your validated user schema
const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(["admin", "user", "moderator"]),
  permissions: z.array(z.string()),
});

type User = z.infer<typeof UserSchema>;

interface AppContext {
  user: User | null;
}

class UnauthorizedError extends TaggedError {
  readonly _tag = "UnauthorizedError" as const;
  constructor(public readonly message: string = "Authentication required") {
    super(message);
  }
}

const UnauthorizedErrorSchema = z.object({
  _tag: z.literal("UnauthorizedError"),
  message: z.string(),
});

const factory = init<AppContext>();

const protectedProcedure = factory.procedure
  .errors({ 401: UnauthorizedErrorSchema })
  .use(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user) {
      return err(new UnauthorizedError());
    }

    // Optionally re-validate to ensure type safety
    const validatedUser = UserSchema.parse(ctx.user);

    // Return context with validated user
    return next({ ctx: { user: validatedUser } });
  });

export const appRouter = router({
  profile: protectedProcedure
    .input({})
    .output(UserSchema)
    .get((opts) => {
      // opts.ctx.user is validated and typed
      const { ctx } = opts;
      return ok(ctx.user!);
    }),
});
```

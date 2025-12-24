# Middleware

Apply middleware to procedures to add cross-cutting concerns like authentication, logging, or rate limiting.

## Procedure-Level Middleware

Apply middleware to specific procedures using `.use()`:

```typescript
import { router, publicProcedure, ok } from "@alt-stack/server-hono";
import { z } from "zod";

export const userRouter = router({
  create: publicProcedure
    .input({
      body: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
    })
    .output(
      z.object({
        id: z.string(),
      })
    )
    .use(async (opts) => {
      // Log before handler
      const { ctx, next } = opts;
      console.log("Creating user:", ctx.input.name);
      return next();
    })
    .post((opts) => {
      return ok({ id: "1" });
    }),
});
```

## Context Extension

Middleware can extend the context by passing updated context to `next()`. This follows the tRPC pattern:

```typescript
import { router, publicProcedure, init, ok, err, TaggedError } from "@alt-stack/server-hono";
import { z } from "zod";

interface AppContext {
  user: { id: string; name: string } | null;
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

const loggerMiddleware = async (opts: {
  ctx: any;
  next: (opts?: { ctx: Partial<any> }) => Promise<any>;
}) => {
  const { ctx, next } = opts;
  const start = Date.now();
  const result = await next();
  const duration = Date.now() - start;
  console.log(`Request took ${duration}ms`);
  return result;
};

const authMiddleware = async (opts: {
  ctx: any;
  next: (opts?: { ctx: Partial<any> }) => Promise<any>;
}) => {
  const { ctx, next } = opts;
  const user = await authenticate(ctx.hono.req);
  if (!user) {
    return err(new UnauthorizedError());
  }
  // Extend context - user is now non-null in subsequent handlers
  return next({ ctx: { user } });
};

const protectedProcedure = factory.procedure
  .errors({ 401: UnauthorizedErrorSchema })
  .use(loggerMiddleware)
  .use(authMiddleware);

export const appRouter = router({
  profile: protectedProcedure
    .input({})
    .get((opts) => {
      // opts.ctx.user is guaranteed to be non-null
      const { ctx } = opts;
      return ok({ id: ctx.user!.id, name: ctx.user!.name });
    }),
});
```

## Multiple Middleware

Chain multiple middleware on the same procedure:

```typescript
import { router, publicProcedure, init, ok, err, TaggedError } from "@alt-stack/server-hono";
import { z } from "zod";

interface AppContext {
  user: { id: string; role: string } | null;
}

class ForbiddenError extends TaggedError {
  readonly _tag = "ForbiddenError" as const;
  constructor(public readonly message: string = "Access denied") {
    super(message);
  }
}

const ForbiddenErrorSchema = z.object({
  _tag: z.literal("ForbiddenError"),
  message: z.string(),
});

const factory = init<AppContext>();

const loggerMiddleware = async (opts: any) => {
  console.log("Request started");
  return opts.next();
};

const authMiddleware = async (opts: any) => {
  const user = await getUser(opts.ctx);
  return opts.next({ ctx: { user } });
};

const adminMiddleware = async (opts: any) => {
  if (opts.ctx.user?.role !== "admin") {
    return err(new ForbiddenError("Admin access required"));
  }
  return opts.next();
};

const adminProcedure = factory.procedure
  .errors({ 403: ForbiddenErrorSchema })
  .use(loggerMiddleware)
  .use(authMiddleware)
  .use(adminMiddleware);

export const adminRouter = router({
  settings: adminProcedure.get(() => {
    return ok({ admin: true });
  }),
});
```

Middleware executes in the order they're defined.

## Reusable Procedures

Create reusable procedures with middleware to reuse authentication or other middleware across multiple routes. See the [Reusable Procedures guide](/core-concepts/reusable-procedures) for details:

```typescript
import { router, publicProcedure, init, ok, err, TaggedError } from "@alt-stack/server-hono";
import { z } from "zod";

interface AppContext {
  user: { id: string; name: string } | null;
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

// Create reusable procedures
const publicProc = publicProcedure;
const protectedProcedure = factory.procedure
  .errors({ 401: UnauthorizedErrorSchema })
  .use(async (opts) => {
    // Auth middleware
    const { ctx, next } = opts;
    if (!ctx.user) {
      return err(new UnauthorizedError());
    }
    return next({ ctx: { user: ctx.user } });
  });

// Use procedures
export const appRouter = router({
  hello: publicProc.get(() => ok("hello")),
  profile: protectedProcedure
    .input({})
    .output(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .get((opts) => {
      return ok(opts.ctx.user!);
    }),
});
```

## Middleware Chaining and Context Flow

Middleware can chain together, with each middleware able to extend the context:

```typescript
import { router, publicProcedure, init, ok } from "@alt-stack/server-hono";

interface AppContext {
  user: { id: string; role: string } | null;
  requestId: string;
  isAdmin: boolean;
}

const factory = init<AppContext>();

// First middleware adds requestId
const requestIdMiddleware = async (opts: any) => {
  const requestId = crypto.randomUUID();
  return opts.next({ ctx: { requestId } });
};

// Second middleware adds user
const authMiddleware = async (opts: any) => {
  const user = await getUser(opts.ctx);
  return opts.next({ ctx: { user } });
};

// Third middleware adds isAdmin based on user role
const adminCheckMiddleware = async (opts: any) => {
  const isAdmin = opts.ctx.user?.role === "admin";
  return opts.next({ ctx: { isAdmin } });
};

const adminProcedure = factory.procedure
  .use(requestIdMiddleware)
  .use(authMiddleware)
  .use(adminCheckMiddleware);

export const adminRouter = router({
  dashboard: adminProcedure
    .input({})
    .get((opts) => {
      // All context extensions are available
      const { ctx } = opts;
      return ok({
        requestId: ctx.requestId,
        userId: ctx.user!.id,
        isAdmin: ctx.isAdmin,
      });
    }),
});
```

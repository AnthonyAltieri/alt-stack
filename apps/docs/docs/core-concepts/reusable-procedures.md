# Reusable Procedures

Create reusable procedures with middleware to follow the tRPC pattern. This allows you to define common authentication, validation, or other middleware once and reuse it across multiple routes.

## Basic Pattern

Use `init()` to create procedures and routers:

```typescript
import { init, createServer } from "@alt-stack/server";
import { z } from "zod";

interface AppContext {
  user: { id: string; name: string } | null;
}

const factory = init<AppContext>();

// Create reusable procedures from init()
const publicProcedure = factory.procedure;
const protectedProcedure = factory.procedure
  .errors({
    401: z.object({
      error: z.object({
        code: z.literal("UNAUTHORIZED"),
        message: z.string(),
      }),
    }),
  })
  .use(
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

// Create a router
const router = factory.router();

// Use procedures to create routes
publicProcedure.on(router)
  .get("/hello", {
    input: {},
    output: z.string(),
  })
  .handler(() => {
    return "hello world";
  });

protectedProcedure.on(router)
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

protectedProcedure.on(router)
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

## Configuring Procedures

Procedures support the same configuration methods as regular routes:

### Setting Default Input

```typescript
const factory = init();
const router = factory.router();

const validatedProcedure = factory.procedure.input({
  query: z.object({
    apiKey: z.string().min(1),
  }),
});

// All routes using this procedure will require apiKey in query
validatedProcedure.on(router)
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
const factory = init();
const router = factory.router();

const jsonProcedure = factory.procedure.output(
  z.object({
    success: z.boolean(),
  })
);

jsonProcedure.on(router)
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
const factory = init();
const router = factory.router();

const errorProcedure = factory.procedure.errors({
  401: z.object({
    error: z.object({
      code: z.literal("UNAUTHORIZED"),
      message: z.string(),
    }),
  }),
});

errorProcedure.on(router)
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

### Combining Procedure and Route Errors

Errors defined on procedures are automatically merged with errors defined on routes. Route errors take precedence when the same status code is defined in both:

```typescript
const factory = init();
const router = factory.router();

// Procedure defines common authentication error
const apiProcedure = factory.procedure.errors({
  401: z.object({
    error: z.object({
      code: z.literal("UNAUTHORIZED"),
      message: z.string(),
    }),
  }),
});

// Route adds route-specific errors
apiProcedure.on(router)
  .get("/users/{id}", {
    input: {
      params: z.object({ id: z.string() }),
    },
    output: z.object({ id: z.string(), name: z.string() }),
    errors: {
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
    },
  })
  .handler((ctx) => {
    const user = findUser(ctx.input.id);
    
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
  });
```

In this example, the route has access to all three error types:
- `401 UNAUTHORIZED` from the procedure
- `404 NOT_FOUND` from the route
- `403 FORBIDDEN` from the route

**Union of Error Schemas**: If both the procedure and route define an error with the same status code, the schemas are unioned. This means `ctx.error()` can accept either schema for that status code:

```typescript
const apiProcedure = factory.procedure.errors({
  401: z.object({
    error: z.object({
      code: z.literal("UNAUTHORIZED"),
      message: z.string(),
    }),
  }),
});

apiProcedure.on(router)
  .get("/users/{id}", {
    input: {
      params: z.object({ id: z.string() }),
    },
    output: z.object({ id: z.string() }),
    errors: {
      // 401 error schema is unioned with procedure's 401
      401: z.object({
        error: z.object({
          code: z.literal("AUTH_REQUIRED"),
          message: z.string(),
          redirect: z.string().url(), // Additional field in route's 401
        }),
      }),
      404: z.object({
        error: z.object({
          code: z.literal("NOT_FOUND"),
          message: z.string(),
        }),
      }),
    },
  })
  .handler((ctx) => {
    if (!isAuthenticated()) {
      // Can throw either procedure's 401 schema or route's 401 schema
      throw ctx.error({
        error: {
          code: "UNAUTHORIZED", // From procedure
          message: "Please log in",
        },
      });
      // OR
      throw ctx.error({
        error: {
          code: "AUTH_REQUIRED", // From route
          message: "Authentication required",
          redirect: "https://example.com/login",
        },
      });
    }
    
    if (!user) {
      throw ctx.error({
        error: {
          code: "NOT_FOUND",
          message: "User not found",
        },
      });
    }
    
    return user;
  });
```

Both 401 error schemas are valid because they're unioned together. This allows flexibility while maintaining type safety.

## Chaining Middleware

You can chain multiple middleware on procedures:

```typescript
const factory = init();
const loggedProcedure = factory.procedure.use(async (opts) => {
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
const factory = init();
const apiProcedure = factory.procedure
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
const factory = init<AppContext>();
const router = factory.router();

const protectedProcedure = factory.procedure
  .errors({
    401: z.object({
      error: z.object({
        code: z.literal("UNAUTHORIZED"),
        message: z.string(),
      }),
    }),
  })
  .use(
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

protectedProcedure.on(router)
  .get("/profile", {
    input: {},
    output: z.object({ id: z.string() }),
    // errors are inherited from protectedProcedure
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
const factory = init<AppContext>();
const router = factory.router();

const publicProcedure = factory.procedure;
const protectedProcedure = factory.procedure.use(authMiddleware);

// Public route
publicProcedure.on(router).get("/hello", { input: {}, output: z.string() }).handler(() => "hello");

// Protected route
protectedProcedure.on(router).get("/profile", { input: {}, output: UserSchema }).handler((ctx) => {
  return ctx.user!; // Non-null due to middleware
});
```

### Role-Based Procedures

```typescript
const factory = init<AppContext>();

const requireRole = (role: string) =>
  factory.procedure.use(async (opts) => {
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
const factory = init();

const rateLimitedProcedure = factory.procedure.use(async (opts) => {
  const rateLimitKey = getRateLimitKey(opts.ctx);
  if (await isRateLimited(rateLimitKey)) {
    return new Response("Too many requests", { status: 429 });
  }
  await incrementRateLimit(rateLimitKey);
  return opts.next();
});
```


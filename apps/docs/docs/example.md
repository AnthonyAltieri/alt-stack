# Kitchen Sink Example

A comprehensive example demonstrating all features of Altstack with the tRPC-style API. This example shows a complete Todo API server with authentication, error handling, middleware, and type safety.

**Note**: In the tRPC-style API, the keys in the `router()` object become the endpoint paths. For example, `list: publicProcedure.get(...)` creates the route `/list`, and `"{id}": publicProcedure.get(...)` creates the route `/{id}`. When routers are nested, paths combine (e.g., `todos: todoRouter` with key `"{id}"` creates `/todos/{id}`).

**Multiple HTTP Methods on Same Path**: To define multiple HTTP methods for the same path (e.g., GET, PUT, DELETE on `/todos/{id}`), use a nested methods object with `.handler()` instead of `.get()`, `.put()`, etc. The HTTP method is automatically inferred from the object key. For example:
```typescript
"{id}": {
  get: publicProc.input(...).handler((opts) => { ... }),
  put: protectedProcedure.input(...).handler((opts) => { ... }),
  delete: protectedProcedure.input(...).handler((opts) => { ... }),
}
```

**Default Error Schemas**: 400 (validation) and 500 (internal server) errors are automatically included for all procedures. When you provide a custom 400 or 500 error via `.errors()`, it will be unioned with the default, allowing your procedure to accept both the default error format and your custom format. You can override the default error handlers in `init()` options.

## Complete Server Implementation

```typescript
import { router, publicProcedure, init, createServer } from "@alt-stack/server";
import type { BaseContext, Middleware } from "@alt-stack/server";
import type { Context } from "hono";
import { z } from "zod";

// ============================================================================
// Type Definitions
// ============================================================================

const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.literal("admin", "user"),
});
type User = z.infer<typeof UserSchema>;

interface AppContext {
  user: User | null;
}

const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  completed: z.boolean(),
  createdAt: z.string(),
  userId: z.string(),
});
type Todo = z.infer<typeof TodoSchema>;

// ============================================================================
// Reusable Procedures
// ============================================================================

// Initialize factory with default error handlers
// You can override default 400/500 error handlers here if needed:
// const factory = init<AppContext>({
//   default400Error: (errors, variant, value) => [customSchema, customInstance],
//   default500Error: (error) => [customSchema, customInstance],
// });
const factory = init<AppContext>();

// Public procedure (no auth required)
const publicProc = publicProcedure;

// Protected procedure with authentication middleware
const protectedProcedure = factory.procedure
  .errors({
    401: z.object({
      error: z.object({
        code: z.literal("UNAUTHORIZED"),
        message: z.string(),
      }),
    }),
  })
  .use(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user) {
      throw ctx.error({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
    }
    return next({ ctx: { user: ctx.user } });
  });

// Admin-only procedure
const adminProcedure = protectedProcedure
  .errors({
    403: z.object({
      error: z.object({
        code: z.literal("FORBIDDEN"),
        message: z.string(),
      }),
    }),
  })
  .use(async (opts) => {
    const { ctx, next } = opts;
    if (ctx.user.role !== "admin") {
      throw ctx.error({
        error: {
          code: "FORBIDDEN",
          message: "Admin access required",
        },
      });
    }
    return next();
  });

// ============================================================================
// Routers
// ============================================================================

// Todo router with full CRUD operations
export const todoRouter = router<AppContext>({
  // GET /todos - List all todos with query filtering
  // POST /todos - Create new todo (protected)
  "/": {
    get: publicProc
      .input({
        query: z.object({
          completed: z.enum(["true", "false"]).optional(),
          limit: z.number().int().positive().optional(),
          offset: z.number().int().nonnegative().optional(),
        }),
      })
      .output(z.array(TodoSchema))
      .handler((opts) => {
        const { input } = opts;
        // ✅ input.completed is typed as "true" | "false" | undefined
        // ✅ input.limit and input.offset are typed
        let todos = getAllTodos();

        if (input.completed === "true") {
          todos = todos.filter((t) => t.completed);
        } else if (input.completed === "false") {
          todos = todos.filter((t) => !t.completed);
        }

        if (input.limit) {
          todos = todos.slice(
            input.offset ?? 0,
            (input.offset ?? 0) + input.limit,
          );
        }

        return todos; // ✅ Return type matches z.array(TodoSchema)
      }),

    post: protectedProcedure
      .input({
        body: z.object({
          title: z.string().min(1).max(200),
          description: z.string().max(1000).optional(),
        }),
      })
      .output(TodoSchema)
      // ✅ 400 validation error is automatically included - no need to declare it
      // ✅ 500 internal server error is also automatically included
      .handler((opts) => {
        const { input, ctx } = opts;
        // ✅ input.title is string (min 1, max 200)
        // ✅ input.description is string | undefined (max 1000)
        // ✅ ctx.user is guaranteed non-null (from middleware)

        const todo = createTodo({
          title: input.title,
          description: input.description,
          userId: ctx.user!.id,
        });

        return todo;
      }),
  },

  // GET /todos/{id} - Get single todo with path parameter
  // PUT /todos/{id} - Update todo
  // DELETE /todos/{id} - Delete todo
  // Using nested methods object to support multiple HTTP methods on the same path
  "{id}": {
    get: publicProc
      .input({
        params: z.object({
          id: z.string().uuid(), // ✅ TypeScript enforces params.id matches {id}
        }),
      })
      .output(TodoSchema)
      .errors({
        404: z.object({
          error: z.object({
            code: z.literal("NOT_FOUND"),
            message: z.string(),
          }),
        }),
      })
      .handler((opts) => {
        const { input, ctx } = opts;
        // ✅ input.id is typed as string (from params)
        const todo = getTodoById(input.id);

        if (!todo) {
          throw ctx.error({
            // ✅ TypeScript ensures code is "NOT_FOUND"
            // ✅ Status code (404) is automatically inferred!
            error: {
              code: "NOT_FOUND",
              message: `Todo with id ${input.id} not found`,
            },
          });
        }

        return todo; // ✅ Return type matches TodoSchema
      }),

    put: protectedProcedure
      .input({
        params: z.object({
          id: z.string().uuid(),
        }),
        query: z.object({
          notify: z.boolean().optional(),
        }),
        body: z.object({
          title: z.string().min(1).max(200).optional(),
          description: z.string().max(1000).optional(),
          completed: z.boolean().optional(),
        }),
      })
      .output(TodoSchema)
      .errors({
        // ✅ 400 and 500 errors are automatically included (default validation and internal server errors)
        // ✅ Custom 400 error will be unioned with the default validation error
        // This means ctx.error() can accept either the default validation error OR this custom error
        400: z.object({
          error: z.object({
            code: z.literal("CUSTOM_VALIDATION_ERROR"),
            message: z.string(),
            field: z.string(),
          }),
        }),
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
      .handler((opts) => {
        const { input, ctx } = opts;
        // ✅ All inputs are available and typed:
        // input.id (from params)
        // input.notify (from query, optional)
        // input.title, input.description, input.completed (from body, all optional)

        const todo = getTodoById(input.id);
        if (!todo) {
          throw ctx.error({
            error: {
              code: "NOT_FOUND",
              message: `Todo with id ${input.id} not found`,
            },
          });
        }

        // Check ownership
        if (todo.userId !== ctx.user!.id && ctx.user!.role !== "admin") {
          throw ctx.error({
            error: {
              code: "FORBIDDEN",
              message: "You don't have permission to update this todo",
            },
          });
        }

        const updated = updateTodo(input.id, {
          title: input.title,
          description: input.description,
          completed: input.completed,
        });

        if (input.notify) {
          // Send notification
        }

        return updated;
      }),

    delete: protectedProcedure
      .input({
        params: z.object({
          id: z.string().uuid(),
        }),
      })
      .output(
        z.object({
          success: z.boolean(),
        }),
      )
      .errors({
        404: z.object({
          error: z.object({
            code: z.literal("NOT_FOUND"),
            message: z.string(),
          }),
        }),
      })
      .handler((opts) => {
        const { input, ctx } = opts;
        const todo = getTodoById(input.id);
        if (!todo) {
          throw ctx.error({
            error: {
              code: "NOT_FOUND",
              message: `Todo with id ${input.id} not found`,
            },
          });
        }

        deleteTodo(input.id);
        return { success: true };
      }),
  },

  // PATCH /todos/{id}/complete - Partial update with nested path
  "{id}/complete": protectedProcedure
    .input({
      params: z.object({
        id: z.string().uuid(),
      }),
      body: z.object({
        completed: z.boolean(),
      }),
    })
    .output(TodoSchema)
    .errors({
      404: z.object({
        error: z.object({
          code: z.literal("NOT_FOUND"),
          message: z.string(),
        }),
      }),
    })
    .patch((opts) => {
      const { input } = opts;
      const todo = getTodoById(input.id);
      if (!todo) {
        throw opts.ctx.error({
          error: {
            code: "NOT_FOUND",
            message: `Todo with id ${input.id} not found`,
          },
        });
      }
      return updateTodo(input.id, { completed: input.completed });
    }),
});

// User router with profile management
export const userRouter = router<AppContext>({
  // GET /users/me - Get current user profile
  me: protectedProcedure
    .input({})
    .output(
      z.object({
        id: z.string(),
        email: z.string(),
        role: z.enum(["admin", "user"]),
      }),
    )
    .get((opts) => {
      const { ctx } = opts;
      // ✅ ctx.user is guaranteed non-null after middleware
      return {
        id: ctx.user!.id,
        email: ctx.user!.email,
        role: ctx.user!.role,
      };
    }),

  // GET /users/{id} - Get user by ID
  "{id}": publicProc
    .input({
      params: z.object({
        id: z.string().uuid(),
      }),
    })
    .output(
      z.object({
        id: z.string(),
        email: z.string(),
      }),
    )
    .errors({
      404: z.object({
        error: z.object({
          code: z.literal("NOT_FOUND"),
          message: z.string(),
        }),
      }),
    })
    .get((opts) => {
      const { input, ctx } = opts;
      const user = getUserById(input.id);
      if (!user) {
        throw ctx.error({
          error: {
            code: "NOT_FOUND",
            message: `User with id ${input.id} not found`,
          },
        });
      }
      return { id: user.id, email: user.email };
    }),
});

// Admin router (admin-only routes)
export const adminRouter = router<AppContext>({
  // GET /admin/users - List all users (admin only)
  users: adminProcedure
    .input({
      query: z.object({
        role: z.enum(["admin", "user"]).optional(),
      }),
    })
    .output(
      z.array(
        z.object({
          id: z.string(),
          email: z.string(),
          role: z.enum(["admin", "user"]),
        }),
      ),
    )
    .get((opts) => {
      const { input } = opts;
      let users = getAllUsers();
      if (input.role) {
        users = users.filter((u) => u.role === input.role);
      }
      return users;
    }),

  // DELETE /admin/users/{id} - Delete user (admin only)
  "users/{id}": adminProcedure
    .input({
      params: z.object({
        id: z.string().uuid(),
      }),
    })
    .output(
      z.object({
        success: z.boolean(),
      }),
    )
    .errors({
      404: z.object({
        error: z.object({
          code: z.literal("NOT_FOUND"),
          message: z.string(),
        }),
      }),
    })
    .delete((opts) => {
      const { input, ctx } = opts;
      const user = getUserById(input.id);
      if (!user) {
        throw ctx.error({
          error: {
            code: "NOT_FOUND",
            message: `User with id ${input.id} not found`,
          },
        });
      }
      deleteUser(input.id);
      return { success: true };
    }),
});

// ============================================================================
// Router-Level Middleware
// ============================================================================

// Logging middleware for all routes
const loggingMiddleware: Middleware<BaseContext & AppContext> = async ({
  ctx,
  next,
}) => {
  const start = Date.now();
  const result = await next();
  const duration = Date.now() - start;
  console.log(`[${ctx.hono.req.method}] ${ctx.hono.req.url} - ${duration}ms`);
  return result;
};

// Apply middleware to todo router
const todoRouterWithLogging = todoRouter.use(loggingMiddleware);

// ============================================================================
// Combine Routers
// ============================================================================

const appRouter = router<AppContext>({
  todos: todoRouterWithLogging, // /todos/*
  users: userRouter, // /users/*
  admin: adminRouter, // /admin/*
});

// ============================================================================
// Helper Functions (implementation details)
// ============================================================================

function getAllTodos(): Todo[] {
  // Implementation
  return [];
}

function getTodoById(_id: string): Todo | null {
  // Implementation
  return null;
}

function createTodo(data: {
  title: string;
  description?: string;
  userId: string;
}): Todo {
  // Implementation
  return {
    id: crypto.randomUUID(),
    title: data.title,
    description: data.description,
    completed: false,
    createdAt: new Date().toISOString(),
    userId: data.userId,
  };
}

function updateTodo(
  _id: string,
  _data: { title?: string; description?: string; completed?: boolean },
) {
  // Implementation
  return getTodoById(_id)!;
}

function deleteTodo(_id: string): void {
  // Implementation
}

function getAllUsers(): User[] {
  // Implementation
  return [];
}

function getUserById(_id: string): User | null {
  // Implementation
  return null;
}

function deleteUser(_id: string): void {
  // Implementation
}

function getUserFromRequest(_request: Request): User {
  // Extract user from request (e.g., from JWT token)
  return null!;
}

// ============================================================================
// Create Server
// ============================================================================

async function createContext(c: Context): Promise<AppContext> {
  const user = await getUserFromRequest(c.req.raw);
  return { user };
}

const app = createServer<AppContext>(
  {
    api: appRouter, // All routes prefixed with /api
  },
  {
    createContext,
    docs: {
      path: "/docs",
      openapiPath: "/docs/openapi.json",
    },
  },
);

export default app;
```

## Key Features Demonstrated

### 1. **Type-Safe Path Parameters**
```typescript
"{id}": publicProc
  .input({
    params: z.object({
      id: z.string().uuid(), // ✅ TypeScript enforces this matches {id}
    }),
  })
```
TypeScript will error if you use `{id}` without providing `params.id`.

### 2. **Multiple Error Types**
```typescript
.errors({
  404: z.object({ error: z.object({ code: z.literal("NOT_FOUND"), ... }) }),
  403: z.object({ error: z.object({ code: z.literal("FORBIDDEN"), ... }) }),
})
```
Each route can define multiple error types with different status codes.

### 3. **Combining Input Sources**
```typescript
.input({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({ notify: z.boolean().optional() }),
  body: z.object({ title: z.string().optional() }),
})
```
Routes can use params, query, and body together.

### 4. **Middleware Chaining**
```typescript
const adminProcedure = protectedProcedure
  .use(async (opts) => {
    // Additional middleware
  });
```
Middleware can be chained to build up context and permissions.

### 5. **Router-Level Middleware**
```typescript
const todoRouterWithLogging = todoRouter.use(loggingMiddleware);
```
Apply middleware to all routes in a router.

### 6. **Nested Routers**
```typescript
const appRouter = router<AppContext>({
  todos: todoRouterWithLogging, // /todos/*
  users: userRouter,            // /users/*
  admin: adminRouter,           // /admin/*
});
```
Routers can be nested, and paths combine automatically.

### 7. **Output Validation**
```typescript
.output(TodoSchema)
```
Return types are validated against Zod schemas.

## Type Safety Highlights

- ✅ **Path parameters**: TypeScript enforces `{id}` requires `params.id`
- ✅ **Input types**: All inputs (`params`, `query`, `body`) are fully typed
- ✅ **Output types**: Return values are validated and typed
- ✅ **Error types**: `ctx.error()` only accepts defined error schemas
- ✅ **Context narrowing**: Middleware can extend context with type safety
- ✅ **Status codes**: Error status codes are inferred from error schemas

## Try It Yourself

The complete example server is available in the repository:
- **Server**: `apps/example-altstack-server/`
- Run it: `pnpm --filter example-altstack-server dev`

See the [Installation Guide](/getting-started/installation) to get started building your own type-safe API!

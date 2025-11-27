import type { BaseContext, Middleware } from "@alt-stack/server";
import { createServer, init, router } from "@alt-stack/server";
import type { Context } from "hono";
import { z } from "zod";

// ============================================================================
// Type Definitions
// ============================================================================

const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.enum(["admin", "user"]),
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
const publicProc = factory.procedure;

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
      // Only allowed to throw default errors or defined errors with ctx.error()
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
// In-Memory Database
// ============================================================================

const db = {
  todos: new Map<string, Todo>(),
  users: new Map<string, User>(),
} as const;

// Seed initial data
const ADMIN_USER_ID = "00000000-0000-0000-0000-000000000001";
const REGULAR_USER_ID = "00000000-0000-0000-0000-000000000002";
function seedDatabase() {
  // Seed users
  const adminUser: User = {
    id: ADMIN_USER_ID,
    email: "admin@example.com",
    role: "admin",
  };
  const regularUser: User = {
    id: REGULAR_USER_ID,
    email: "user@example.com",
    role: "user",
  };
  db.users.set(adminUser.id, adminUser);
  db.users.set(regularUser.id, regularUser);

  // Seed todos
  const todo1: Todo = {
    id: "10000000-0000-0000-0000-000000000001",
    title: "Learn TypeScript",
    description: "Master TypeScript fundamentals",
    completed: false,
    createdAt: new Date().toISOString(),
    userId: regularUser.id,
  };
  const todo2: Todo = {
    id: "10000000-0000-0000-0000-000000000002",
    title: "Build API",
    description: "Create RESTful API with Hono",
    completed: true,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    userId: regularUser.id,
  };
  db.todos.set(todo1.id, todo1);
  db.todos.set(todo2.id, todo2);
}

// Initialize database on module load
seedDatabase();

// ============================================================================
// Helper Functions (implementation details)
// ============================================================================

function getAllTodos(): Todo[] {
  return Array.from(db.todos.values());
}

function getTodoById(id: string): Todo | null {
  return db.todos.get(id) ?? null;
}

function createTodo(data: {
  title: string;
  description?: string;
  userId: string;
}): Todo {
  const todo: Todo = {
    id: crypto.randomUUID(),
    title: data.title,
    description: data.description,
    completed: false,
    createdAt: new Date().toISOString(),
    userId: data.userId,
  };
  db.todos.set(todo.id, todo);
  return todo;
}

function updateTodo(
  id: string,
  data: { title?: string; description?: string; completed?: boolean },
): Todo {
  const todo = db.todos.get(id);
  if (!todo) {
    throw new Error(`Todo with id ${id} not found`);
  }

  const updated: Todo = {
    ...todo,
    ...(data.title !== undefined && { title: data.title }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.completed !== undefined && { completed: data.completed }),
  };
  db.todos.set(id, updated);
  return updated;
}

function deleteTodo(id: string): void {
  db.todos.delete(id);
}

function getAllUsers(): User[] {
  return Array.from(db.users.values());
}

function getUserById(id: string): User | null {
  return db.users.get(id) ?? null;
}

function deleteUser(id: string): void {
  db.users.delete(id);
  // Also delete all todos belonging to this user
  for (const [todoId, todo] of db.todos.entries()) {
    if (todo.userId === id) {
      db.todos.delete(todoId);
    }
  }
}

function getUserFromRequest(authorization: unknown): User | null {
  // Extract user from request (e.g., from JWT token)
  // For demo purposes, authorization is just the user id
  if (typeof authorization !== "string") return null;
  return db.users.get(authorization) ?? null;
}

// ============================================================================
// Create Server
// ============================================================================

async function createContext(c: Context): Promise<AppContext> {
  const user = await getUserFromRequest(c.req.header("Authorization"));
  return { user };
}

const app = createServer<AppContext>(
  // All routes prefixed with /api
  { api: appRouter },
  { createContext, docs: { path: "/docs", openapiPath: "/docs/openapi.json" } },
);

export default app;

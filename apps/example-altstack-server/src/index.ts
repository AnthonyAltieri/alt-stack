import {
  createDocsRouter,
  createServer,
  init,
  router,
  ok,
  err,
  isErr,
  flatMap,
} from "@alt-stack/server-hono";
import type { Result } from "@alt-stack/server-hono";
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
// Middleware returns err() for type-safe error handling with proper HTTP status codes
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
      // Return err() with _httpCode for proper HTTP status
      return err({
        _httpCode: 401 as const,
        data: {
          error: {
            code: "UNAUTHORIZED" as const,
            message: "Authentication required",
          },
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
    if (ctx.user!.role !== "admin") {
      return err({
        _httpCode: 403 as const,
        data: {
          error: {
            code: "FORBIDDEN" as const,
            message: "Admin access required",
          },
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
          limit: z.coerce.number().int().positive().optional(),
          offset: z.coerce.number().int().nonnegative().optional(),
        }),
      })
      .output(z.array(TodoSchema))
      .handler((opts) => {
        const { input } = opts;
        // ✅ input.query.completed is typed as "true" | "false" | undefined
        // ✅ input.query.limit and input.query.offset are typed
        let todos = getAllTodos();

        if (input.query.completed === "true") {
          todos = todos.filter((t) => t.completed);
        } else if (input.query.completed === "false") {
          todos = todos.filter((t) => !t.completed);
        }

        if (input.query.limit) {
          todos = todos.slice(
            input.query.offset ?? 0,
            (input.query.offset ?? 0) + input.query.limit,
          );
        }

        return ok(todos); // ✅ Return type matches z.array(TodoSchema)
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
        // ✅ input.body.title is string (min 1, max 200)
        // ✅ input.body.description is string | undefined (max 1000)
        // ✅ ctx.user is guaranteed non-null (from middleware)

        const todo = createTodo({
          title: input.body.title,
          description: input.body.description,
          userId: ctx.user!.id,
        });

        return ok(todo);
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
        const { input } = opts;
        // ✅ input.params.id is typed as string (from params)
        const todo = getTodoById(input.params.id);

        if (!todo) {
          return err({
            _httpCode: 404 as const,
            data: {
              error: {
                code: "NOT_FOUND" as const,
                message: `Todo with id ${input.params.id} not found`,
              },
            },
          });
        }

        return ok(todo); // ✅ Return type matches TodoSchema
      }),

    put: protectedProcedure
      .input({
        params: z.object({
          id: z.string().uuid(),
        }),
        query: z.object({
          notify: z.coerce.boolean().optional(),
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
        // This means err() can accept either the default validation error OR this custom error
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
        // input.params.id (from params)
        // input.query.notify (from query, optional)
        // input.body.title, input.body.description, input.body.completed (from body, all optional)

        const todo = getTodoById(input.params.id);
        if (!todo) {
          return err({
            _httpCode: 404 as const,
            data: {
              error: {
                code: "NOT_FOUND" as const,
                message: `Todo with id ${input.params.id} not found`,
              },
            },
          });
        }

        // Check ownership
        if (todo.userId !== ctx.user!.id && ctx.user!.role !== "admin") {
          return err({
            _httpCode: 403 as const,
            data: {
              error: {
                code: "FORBIDDEN" as const,
                message: "You don't have permission to update this todo",
              },
            },
          });
        }

        const updated = updateTodo(input.params.id, {
          title: input.body.title,
          description: input.body.description,
          completed: input.body.completed,
        });

        if (input.query.notify) {
          // Send notification
        }

        return ok(updated);
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
        const { input } = opts;
        const todo = getTodoById(input.params.id);
        if (!todo) {
          return err({
            _httpCode: 404 as const,
            data: {
              error: {
                code: "NOT_FOUND" as const,
                message: `Todo with id ${input.params.id} not found`,
              },
            },
          });
        }

        deleteTodo(input.params.id);
        return ok({ success: true });
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
      const todo = getTodoById(input.params.id);
      if (!todo) {
        return err({
          _httpCode: 404 as const,
          data: {
            error: {
              code: "NOT_FOUND" as const,
              message: `Todo with id ${input.params.id} not found`,
            },
          },
        });
      }
      return ok(updateTodo(input.params.id, { completed: input.body.completed }));
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
      return ok({
        id: ctx.user!.id,
        email: ctx.user!.email,
        role: ctx.user!.role,
      });
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
      const { input } = opts;
      const user = getUserById(input.params.id);
      if (!user) {
        return err({
          _httpCode: 404 as const,
          data: {
            error: {
              code: "NOT_FOUND" as const,
              message: `User with id ${input.params.id} not found`,
            },
          },
        });
      }
      return ok({ id: user.id, email: user.email });
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
      if (input.query.role) {
        users = users.filter((u) => u.role === input.query.role);
      }
      return ok(users);
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
      const { input } = opts;
      const user = getUserById(input.params.id);
      if (!user) {
        return err({
          _httpCode: 404 as const,
          data: {
            error: {
              code: "NOT_FOUND" as const,
              message: `User with id ${input.params.id} not found`,
            },
          },
        });
      }
      deleteUser(input.params.id);
      return ok({ success: true });
    }),
});

// ============================================================================
// V2 Todo Router - Using Result-based Business Logic
// ============================================================================
// This router demonstrates how to use Result types from business logic
// functions directly in handlers. The business logic functions return
// Result types, which handlers can return directly or compose.

export const todoRouterV2 = router<AppContext>({
  // PUT /v2/todos/{id} - Update using Result-based business logic
  // The handler simply calls the business logic function and returns its Result
  "{id}": {
    put: protectedProcedure
      .input({
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          title: z.string().min(1).max(200).optional(),
          description: z.string().max(1000).optional(),
          completed: z.boolean().optional(),
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
        403: z.object({
          error: z.object({
            code: z.literal("FORBIDDEN"),
            message: z.string(),
          }),
        }),
      })
      .handler((opts) => {
        const { input, ctx } = opts;

        // ✅ Business logic returns Result<Todo, TodoError>
        // ✅ Handler can return it directly - errors flow through automatically!
        return updateTodoWithPermission(input.params.id, ctx.user!, {
          title: input.body.title,
          description: input.body.description,
          completed: input.body.completed,
        });
      }),

    delete: protectedProcedure
      .input({
        params: z.object({
          id: z.string().uuid(),
        }),
      })
      .output(z.object({ success: z.boolean() }))
      .errors({
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

        // ✅ Same pattern - business logic Result flows through
        return deleteTodoWithPermission(input.params.id, ctx.user!);
      }),
  },

  // GET /v2/todos/{id} - Demonstrates using isErr for conditional logic
  "{id}/details": publicProc
    .input({
      params: z.object({
        id: z.string().uuid(),
      }),
    })
    .output(
      z.object({
        todo: TodoSchema,
        canEdit: z.boolean(),
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

      // ✅ Use Result from business logic
      const todoResult = findTodoById(input.params.id);

      // ✅ Check if it's an error and return early
      if (isErr(todoResult)) {
        return todoResult; // Type-safe error propagation
      }

      // ✅ After isErr check, TypeScript knows todoResult is Ok<Todo>
      const todo = todoResult.value;

      // Determine if user can edit (owner or admin)
      const canEdit =
        ctx.user !== null &&
        (todo.userId === ctx.user.id || ctx.user.role === "admin");

      return ok({ todo, canEdit });
    }),
});

// ============================================================================
// Combine Routers
// ============================================================================

const appRouter = router<AppContext>({
  todos: todoRouter, // /todos/*
  "v2/todos": todoRouterV2, // /v2/todos/* - Result-based business logic examples
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

function createTodo(data: { title: string; description?: string; userId: string }): Todo {
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
// Business Logic with Result Types
// ============================================================================
// These functions demonstrate how to use Result types in your business logic
// layer. The Result pattern allows errors to flow through the application
// in a type-safe way without throwing exceptions.

// Error types for business logic
type NotFoundError = {
  _httpCode: 404;
  data: { error: { code: "NOT_FOUND"; message: string } };
};

type ForbiddenError = {
  _httpCode: 403;
  data: { error: { code: "FORBIDDEN"; message: string } };
};

type TodoError = NotFoundError | ForbiddenError;

/**
 * Find a todo by ID, returning a Result type
 * This encapsulates the "not found" case as a typed error
 */
function findTodoById(id: string): Result<Todo, NotFoundError> {
  const todo = db.todos.get(id);
  if (!todo) {
    return err({
      _httpCode: 404 as const,
      data: {
        error: {
          code: "NOT_FOUND" as const,
          message: `Todo with id ${id} not found`,
        },
      },
    });
  }
  return ok(todo);
}

/**
 * Check if a user has permission to modify a todo
 * Returns the todo if allowed, or a ForbiddenError if not
 */
function checkTodoPermission(
  todo: Todo,
  user: User,
): Result<Todo, ForbiddenError> {
  if (todo.userId !== user.id && user.role !== "admin") {
    return err({
      _httpCode: 403 as const,
      data: {
        error: {
          code: "FORBIDDEN" as const,
          message: "You don't have permission to modify this todo",
        },
      },
    });
  }
  return ok(todo);
}

/**
 * Update a todo with permission checking - combines multiple Result operations
 * This shows how flatMap can compose Result-returning functions
 */
function updateTodoWithPermission(
  id: string,
  user: User,
  updates: { title?: string; description?: string; completed?: boolean },
): Result<Todo, TodoError> {
  // Use flatMap to chain Result operations:
  // 1. Find the todo (may fail with NotFoundError)
  // 2. Check permissions (may fail with ForbiddenError)
  // 3. Apply updates (always succeeds if we get here)
  return flatMap(
    flatMap(findTodoById(id), (todo) => checkTodoPermission(todo, user)),
    (todo) => {
      const updated: Todo = {
        ...todo,
        ...(updates.title !== undefined && { title: updates.title }),
        ...(updates.description !== undefined && {
          description: updates.description,
        }),
        ...(updates.completed !== undefined && { completed: updates.completed }),
      };
      db.todos.set(id, updated);
      return ok(updated);
    },
  );
}

/**
 * Delete a todo with permission checking
 * Returns success boolean or an error
 */
function deleteTodoWithPermission(
  id: string,
  user: User,
): Result<{ success: boolean }, TodoError> {
  return flatMap(
    flatMap(findTodoById(id), (todo) => checkTodoPermission(todo, user)),
    (todo) => {
      db.todos.delete(todo.id);
      return ok({ success: true });
    },
  );
}

// ============================================================================
// Create Server
// ============================================================================

async function createContext(c: Context): Promise<AppContext> {
  const user = await getUserFromRequest(c.req.header("Authorization"));
  return { user };
}

// Create docs router from all API routes
const docsRouter = createDocsRouter<AppContext>(
  { api: appRouter },
  { title: "Example API", version: "1.0.0" },
);

const app = createServer<AppContext>(
  // All routes prefixed with /api, docs at /docs
  { api: appRouter, docs: docsRouter },
  { createContext },
);

export default app;

// Start server when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const { serve } = await import("@hono/node-server");
  const port = 3000;
  console.log(`Server running at http://localhost:${port}`);
  console.log(`OpenAPI docs at http://localhost:${port}/docs/openapi.json`);
  serve({ fetch: app.fetch, port });
}

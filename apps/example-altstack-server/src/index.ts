import { cors } from "hono/cors";
import {
  createRouter,
  createServer,
  type TypedContext,
  type BaseContext,
} from "@repo/server";
import { z } from "zod";
import type { Context } from "hono";
import { todoStore, TodoSchema } from "./store.js";
import { auth, getAuthUser, type User } from "./auth.js";

// Define app context with user from Better Auth
interface AppContext extends Record<string, unknown> {
  user: User | null;
}

// Create context function that adds authenticated user to context
async function createContext(c: Context): Promise<AppContext> {
  const user = await getAuthUser(c.req.raw);
  return {
    user,
  };
}

const router = createRouter<AppContext>()
  .use(
    async (opts: {
      ctx: BaseContext & AppContext;
      next: (opts?: {
        ctx: Partial<BaseContext & AppContext>;
      }) => Promise<(BaseContext & AppContext) | Response>;
    }) => {
      const { ctx, next } = opts;
      const start = performance.now();
      const result = await next();
      const duration = performance.now() - start;
      const method = ctx.hono.req.method;
      let path: string;
      try {
        path = new URL(ctx.hono.req.url).pathname;
      } catch {
        path = ctx.hono.req.url.split("?")[0] ?? ctx.hono.req.url;
      }
      console.log(`[${method}] ${path} - ${duration.toFixed(2)}ms`);
      return result;
    },
  )
  .get("/", {
    input: {
      query: z.object({
        completed: z.enum(["true", "false"]).optional(),
      }),
    },
    output: z.array(TodoSchema),
  })
  .handler((ctx: TypedContext<any, any, AppContext>) => {
    let todos = todoStore.getAll();

    if (ctx.input.completed === "true") {
      todos = todos.filter((t) => t.completed);
    } else if (ctx.input.completed === "false") {
      todos = todos.filter((t) => !t.completed);
    }

    return todos;
  })
  .get("/{id}", {
    input: {
      params: z.object({
        id: z.string(),
      }),
    },
    output: TodoSchema,
    errors: {
      404: z.object({
        error: z.object({
          code: z.literal("NOT_FOUND"),
          message: z.string(),
        }),
      }),
    },
  })
  .handler(
    (
      ctx: TypedContext<
        { params: z.ZodObject<{ id: z.ZodString }> },
        {
          404: z.ZodObject<{
            error: z.ZodObject<{
              code: z.ZodLiteral<"NOT_FOUND">;
              message: z.ZodString;
            }>;
          }>;
        },
        AppContext
      >,
    ) => {
      const todo = todoStore.getById(ctx.input.id);

      if (!todo) {
        throw ctx.error({
          error: {
            code: "NOT_FOUND",
            message: `Todo with id ${ctx.input.id} not found`,
          },
        });
      }

      return todo;
    },
  )
  .post("/", {
    input: {
      body: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
      }),
    },
    output: TodoSchema,
    errors: {
      400: z.object({
        error: z.object({
          code: z.literal("VALIDATION_ERROR"),
          message: z.string(),
        }),
      }),
    },
  })
  .handler(
    (
      ctx: TypedContext<
        {
          body: z.ZodObject<{
            title: z.ZodString;
            description?: z.ZodOptional<z.ZodString>;
          }>;
        },
        {
          400: z.ZodObject<{
            error: z.ZodObject<{
              code: z.ZodLiteral<"VALIDATION_ERROR">;
              message: z.ZodString;
            }>;
          }>;
        },
        AppContext
      >,
    ) => {
      const todo = todoStore.create({
        title: ctx.input.title,
        description: ctx.input.description,
      });

      return todo;
    },
  )
  .patch("/{id}", {
    input: {
      params: z.object({
        id: z.string(),
      }),
      body: z.object({
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        completed: z.boolean().optional(),
      }),
    },
    output: TodoSchema,
    errors: {
      404: z.object({
        error: z.object({
          code: z.literal("NOT_FOUND"),
          message: z.string(),
        }),
      }),
      400: z.object({
        error: z.object({
          code: z.literal("VALIDATION_ERROR"),
          message: z.string(),
        }),
      }),
    },
  })
  .handler(
    (
      ctx: TypedContext<
        {
          params: z.ZodObject<{ id: z.ZodString }>;
          body: z.ZodObject<{
            title?: z.ZodOptional<z.ZodString>;
            description?: z.ZodOptional<z.ZodString>;
            completed?: z.ZodOptional<z.ZodBoolean>;
          }>;
        },
        {
          404: z.ZodObject<{
            error: z.ZodObject<{
              code: z.ZodLiteral<"NOT_FOUND">;
              message: z.ZodString;
            }>;
          }>;
          400: z.ZodObject<{
            error: z.ZodObject<{
              code: z.ZodLiteral<"VALIDATION_ERROR">;
              message: z.ZodString;
            }>;
          }>;
        },
        AppContext
      >,
    ) => {
      const todo = todoStore.update(ctx.input.id, {
        title: ctx.input.title,
        description: ctx.input.description,
        completed: ctx.input.completed,
      });

      if (!todo) {
        throw ctx.error({
          error: {
            code: "NOT_FOUND",
            message: `Todo with id ${ctx.input.id} not found`,
          },
        });
      }

      return todo;
    },
  )
  .delete("/{id}", {
    input: {
      params: z.object({
        id: z.string(),
      }),
    },
    output: z.object({
      success: z.boolean(),
    }),
    errors: {
      404: z.object({
        error: z.object({
          code: z.literal("NOT_FOUND"),
          message: z.string(),
        }),
      }),
    },
  })
  .handler(
    (
      ctx: TypedContext<
        { params: z.ZodObject<{ id: z.ZodString }> },
        {
          404: z.ZodObject<{
            error: z.ZodObject<{
              code: z.ZodLiteral<"NOT_FOUND">;
              message: z.ZodString;
            }>;
          }>;
        },
        AppContext
      >,
    ) => {
      const deleted = todoStore.delete(ctx.input.id);

      if (!deleted) {
        throw ctx.error({
          error: {
            code: "NOT_FOUND",
            message: `Todo with id ${ctx.input.id} not found`,
          },
        });
      }

      return { success: true };
    },
  );

// Create a reusable protected procedure pattern (tRPC style)
// Following the pattern from https://trpc.io/docs/server/authorization#option-2-authorize-using-middleware
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
  .use(async function isAuthed(opts: {
    ctx: TypedContext<
      { params?: never; query?: never; body?: never },
      {
        401: z.ZodObject<{
          error: z.ZodObject<{
            code: z.ZodLiteral<"UNAUTHORIZED">;
            message: z.ZodString;
          }>;
        }>;
      },
      AppContext
    >;
    next: (opts?: {
      ctx: Partial<
        TypedContext<
          { params?: never; query?: never; body?: never },
          {
            401: z.ZodObject<{
              error: z.ZodObject<{
                code: z.ZodLiteral<"UNAUTHORIZED">;
                message: z.ZodString;
              }>;
            }>;
          },
          AppContext
        >
      >;
    }) => Promise<
      | TypedContext<
          { params?: never; query?: never; body?: never },
          {
            401: z.ZodObject<{
              error: z.ZodObject<{
                code: z.ZodLiteral<"UNAUTHORIZED">;
                message: z.ZodString;
              }>;
            }>;
          },
          AppContext
        >
      | Response
    >;
  }) {
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
    // ✅ Pass updated context where user is non-null
    // This allows the context to have user as non-null for subsequent middleware/handlers
    return opts.next({
      ctx: {
        user: ctx.user, // ✅ user value is known to be non-null now
      },
    });
  })
  .handler(
    (
      ctx: TypedContext<
        { params?: never; query?: never; body?: never },
        {
          401: z.ZodObject<{
            error: z.ZodObject<{
              code: z.ZodLiteral<"UNAUTHORIZED">;
              message: z.ZodString;
            }>;
          }>;
        },
        AppContext
      >,
    ) => {
      // ✅ ctx.user is now known to be non-null after the middleware
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
    },
  );

// Create server with middleware and Better Auth routes
const app = createServer(
  {
    todos: router,
    auth: protectedRouter,
  },
  {
    createContext,
    middleware: {
      "*": {
        methods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        handler: cors({
          origin: process.env.CLIENT_URL || "http://localhost:3000",
          allowHeaders: ["Content-Type", "Authorization"],
          allowMethods: ["POST", "GET", "PUT", "PATCH", "DELETE", "OPTIONS"],
          credentials: true, // Required for Better Auth cookies
          exposeHeaders: ["Set-Cookie"],
        }) as any, // Type assertion needed because CORS returns middleware, not handler
      },
      "/api/auth/*": {
        methods: ["GET", "POST"],
        handler: async (c: Context) => auth.handler(c.req.raw),
      },
    },
  },
);

export default app;

// Start server
const { serve } = await import("@hono/node-server");
const port = Number(process.env.PORT) || 3000;

serve({
  fetch: app.fetch,
  port,
});

console.log(`🚀 Todo server running at http://localhost:${port}`);
console.log(`📝 Available endpoints:`);
console.log(`   GET    /todos`);
console.log(`   GET    /todos/{id}`);
console.log(`   POST   /todos`);
console.log(`   PATCH  /todos/{id}`);
console.log(`   DELETE /todos/{id}`);
console.log(`   GET    /protected/profile (requires auth)`);
console.log(`   Auth routes: /api/auth/*`);

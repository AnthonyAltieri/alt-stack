import {
  createDocsRouter,
  createRouter,
  createServer,
  type BaseContext,
  createMiddleware,
  init,
} from "@alt-stack/server";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { auth, getAuthUser, type User } from "./auth.js";
import { TodoSchema, todoStore } from "./store.js";
import { env } from "./env.js";

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

// Middleware for logging requests
const loggingMiddleware = createMiddleware<AppContext>(
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
);

const router = createRouter<AppContext>()
  .use(loggingMiddleware)
  .get("/", {
    input: {
      query: z.object({
        completed: z.enum(["true", "false"]).optional(),
      }),
    },
    output: z.array(TodoSchema),
  })
  .handler((ctx) => {
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
  .handler((ctx) => {
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
  })
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
  .handler((ctx) => {
    const todo = todoStore.create({
      title: ctx.input.title,
      description: ctx.input.description,
    });

    return todo;
  })
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
  .handler((ctx) => {
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
  })
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
  .handler((ctx) => {
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
  });

// Create a factory for reusable procedures with middleware and error composition
// This demonstrates how middleware errors compose with route errors
const factory = init<AppContext>();

// Create a protected procedure with authentication middleware that defines 401 errors
// These errors will be available to all routes using this procedure
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
    // Middleware can throw errors defined in the procedure's error config
    if (!ctx.user) {
      throw ctx.error({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
    }
    // Pass updated context where user is non-null
    return next({
      ctx: {
        user: ctx.user, // user is known to be non-null after the check
      },
    });
  });

// Create protected router
const protectedRouter = createRouter<AppContext>();

// Example 1: Route that uses the protected procedure and adds its own errors
// The route has access to both:
// - 401 UNAUTHORIZED from the middleware/procedure
// - 404 NOT_FOUND from the route itself
protectedProcedure
  .on(protectedRouter)
  .get("/profile", {
    input: {},
    output: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
    }),
    // Route-specific errors are added to procedure errors
    // Since the procedure already defines 401, both are available
    errors: {
      404: z.object({
        error: z.object({
          code: z.literal("NOT_FOUND"),
          message: z.string(),
        }),
      }),
    },
  })
  .handler((ctx) => {
    // ctx.user is now non-null thanks to the middleware
    // We have access to both 401 (from procedure) and 404 (from route) errors
    if (!ctx.user) {
      throw ctx.error({
        error: {
          code: "UNAUTHORIZED",
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

// Example 2: Route that uses the protected procedure and adds a different 401 error schema
// When both procedure and route define the same status code, the schemas are unioned
// This allows ctx.error() to accept either schema for that status code
protectedProcedure
  .on(protectedRouter)
  .get("/settings", {
    input: {},
    output: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
      preferences: z.object({
        theme: z.string(),
        notifications: z.boolean(),
      }),
    }),
    // Route defines a different 401 error schema - they will be unioned
    errors: {
      401: z.object({
        error: z.object({
          code: z.literal("SESSION_EXPIRED"),
          message: z.string(),
          redirect: z.string().url(),
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
  .use(async (opts) => {
    const { ctx, next } = opts;
    // Additional middleware can also throw errors
    // This route can throw:
    // - 401 with either UNAUTHORIZED (from procedure) or SESSION_EXPIRED (from route, unioned)
    // - 403 FORBIDDEN (from route)
    // In a real app, you might check session expiration here
    if (!ctx.user) {
      throw ctx.error({
        error: {
          code: "SESSION_EXPIRED",
          message: "Your session has expired",
          redirect: "https://example.com/login",
        },
      });
    }
    return next();
  })
  .handler((ctx) => {
    // This handler has access to:
    // - 401 errors: either UNAUTHORIZED (from procedure) or SESSION_EXPIRED (from route, unioned)
    // - 403 FORBIDDEN (from route)
    if (!ctx.user) {
      throw ctx.error({
        error: {
          code: "FORBIDDEN",
          message: "Access denied",
        },
      });
    }
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      preferences: {
        theme: "dark",
        notifications: true,
      },
    };
  });

// Create docs router for OpenAPI documentation
const docsRouter = createDocsRouter(
  {
    todos: router,
    auth: protectedRouter,
  },
  {
    title: "Todo API",
    version: "1.0.0",
    description: "A simple todo API with authentication and error composition",
  },
);

// Create server with middleware and Better Auth routes
const app = createServer(
  {
    todos: router,
    auth: protectedRouter,
    docs: docsRouter,
  },
  {
    createContext,
    docs: {
      path: "/docs",
      openapiPath: "/docs/openapi.json",
    },
    middleware: {
      "*": {
        methods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        handler: cors({
          origin: env.CLIENT_URL,
          allowHeaders: ["Content-Type", "Authorization"],
          allowMethods: ["POST", "GET", "PUT", "PATCH", "DELETE", "OPTIONS"],
          credentials: true,
          exposeHeaders: ["Set-Cookie"],
        }) as any,
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
const port = env.PORT;

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
console.log(`   GET    /auth/profile (requires auth)`);
console.log(
  `   GET    /auth/settings (requires auth, demonstrates error composition)`,
);
console.log(`   Auth routes: /api/auth/*`);
console.log(`📚 Documentation:`);
console.log(`   GET    /docs/openapi.json (OpenAPI spec)`);
console.log(`   GET    /docs (Interactive API docs)`);

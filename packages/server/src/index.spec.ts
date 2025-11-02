import { describe, it, expect } from "vitest";
import { createRouter, createServer, init } from "../src/index.js";
import { z } from "zod";

describe("server", () => {
  it("should create a router and server", () => {
    const router = createRouter()
      .get("/test/{id}", {
        input: {
          params: z.object({
            id: z.string(),
          }),
        },
        output: z.object({
          id: z.string(),
          name: z.string(),
        }),
      })
      .handler((ctx) => {
        return { id: ctx.input.id, name: "Test" };
      });

    const app = createServer({ test: router });
    expect(app).toBeDefined();
  });

  it("should handle errors", () => {
    const router = createRouter()
      .get("/test/{id}", {
        input: {
          params: z.object({
            id: z.string(),
          }),
        },
        output: z.object({
          id: z.string(),
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
        if (ctx.input.id === "invalid") {
          throw ctx.error({
            error: {
              code: "NOT_FOUND",
              message: "Resource not found",
            },
          });
        }
        return { id: ctx.input.id };
      });

    const app = createServer({ test: router });
    expect(app).toBeDefined();
  });

  it("should combine routers", () => {
    const userRouter = createRouter()
      .get("/{id}", {
        input: {
          params: z.object({
            id: z.string(),
          }),
        },
        output: z.object({
          id: z.string(),
        }),
      })
      .handler((ctx) => {
        return { id: ctx.input.id };
      });

    const postsRouter = createRouter()
      .get("/", {
        input: {},
        output: z.array(z.object({ id: z.string() })),
      })
      .handler(() => {
        return [{ id: "1" }];
      });

    const app = createServer({
      users: userRouter,
      posts: postsRouter,
    });
    expect(app).toBeDefined();
  });

  it("should support reusable procedures with middleware", () => {
    interface AppContext {
      user?: { id: string; name: string };
    }

    const router = createRouter<AppContext>();

    // Create a protected procedure with middleware
    const protectedProcedure = router.procedure.use(
      async function isAuthed(opts) {
        const { ctx } = opts;
        if (!ctx.user) {
          return new Response("Unauthorized", { status: 401 });
        }
        // Narrow context - pass updated context with non-null user
        return opts.next({
          ctx: {
            user: ctx.user,
          },
        });
      },
    );

    protectedProcedure
      .get("/secret", {
        input: {},
        output: z.object({
          secret: z.string(),
        }),
      })
      .handler((ctx) => {
        // ctx.user should be available here (though TS may not fully track it)
        return {
          secret: "sauce",
        };
      });

    const app = createServer({ test: router });
    expect(app).toBeDefined();
  });

  it("should support reusable procedures with init() and router.procedure", () => {
    interface AppContext {
      user?: { id: string; name: string };
    }

    const t = init<AppContext>();

    // Create a router and use router.procedure (which has router context)
    const router = t.router();

    // Create a protected procedure from the router
    const protectedProcedure = router.procedure.use(
      async function isAuthed(opts) {
        const { ctx } = opts;
        if (!ctx.user) {
          return new Response("Unauthorized", { status: 401 });
        }
        return opts.next({
          ctx: {
            user: ctx.user,
          },
        });
      },
    );

    // Use the procedure to create routes
    protectedProcedure
      .get("/secret", {
        input: {},
        output: z.object({
          secret: z.string(),
        }),
      })
      .handler((ctx) => {
        return {
          secret: "sauce",
        };
      });

    const app = createServer({ test: router });
    expect(app).toBeDefined();
  });

  it("should support public and protected procedures pattern", () => {
    interface AppContext {
      user?: { id: string; name: string };
    }

    const router = createRouter<AppContext>();

    // Public procedure (no middleware)
    const publicProcedure = router.procedure;

    // Protected procedure (with auth middleware)
    const protectedProcedure = router.procedure.use(
      async function isAuthed(opts) {
        const { ctx } = opts;
        if (!ctx.user) {
          return new Response("Unauthorized", { status: 401 });
        }
        return opts.next({
          ctx: {
            user: ctx.user,
          },
        });
      },
    );

    // Use both procedures
    publicProcedure
      .get("/hello", {
        input: {},
        output: z.string(),
      })
      .handler(() => {
        return "hello world";
      });

    protectedProcedure
      .get("/profile", {
        input: {},
        output: z.object({
          id: z.string(),
          name: z.string(),
        }),
      })
      .handler((ctx) => {
        return {
          id: "1",
          name: "Test User",
        };
      });

    const app = createServer({ test: router });
    expect(app).toBeDefined();
  });
});

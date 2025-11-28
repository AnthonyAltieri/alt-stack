import { describe, it, expect } from "vitest";
import { createServer, router, Router } from "../src/index.js";
import { z } from "zod";

describe("server", () => {
  it("should create a router and server", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/test/{id}": baseRouter.procedure
        .input({ params: z.object({ id: z.string() }) })
        .output(z.object({ id: z.string(), name: z.string() }))
        .get(({ input }) => ({ id: input.params.id, name: "Test" })),
    });

    const app = createServer({ test: testRouter });
    expect(app).toBeDefined();
  });

  it("should handle errors", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/test/{id}": baseRouter.procedure
        .input({ params: z.object({ id: z.string() }) })
        .output(z.object({ id: z.string() }))
        .errors({
          404: z.object({
            error: z.object({
              code: z.literal("NOT_FOUND"),
              message: z.string(),
            }),
          }),
        })
        .get(({ input, error }) => {
          if (input.params.id === "invalid") {
            throw error(404, {
              error: { code: "NOT_FOUND", message: "Resource not found" },
            });
          }
          return { id: input.params.id };
        }),
    });

    const app = createServer({ test: testRouter });
    expect(app).toBeDefined();
  });

  it("should combine routers", () => {
    const baseRouter = new Router();
    const userRouter = router({
      "/{id}": baseRouter.procedure
        .input({ params: z.object({ id: z.string() }) })
        .output(z.object({ id: z.string() }))
        .get(({ input }) => ({ id: input.params.id })),
    });

    const postsRouter = router({
      "/": baseRouter.procedure
        .output(z.array(z.object({ id: z.string() })))
        .get(() => [{ id: "1" }]),
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

    const baseRouter = new Router<AppContext>();

    // Create a protected procedure with middleware
    const protectedProcedure = baseRouter.procedure.use(async (opts) => {
      const { ctx } = opts;
      if (!ctx.user) {
        return new Response("Unauthorized", { status: 401 });
      }
      return opts.next({
        ctx: { user: ctx.user },
      });
    });

    const testRouter = router<AppContext>({
      "/secret": protectedProcedure
        .output(z.object({ secret: z.string() }))
        .get(() => ({ secret: "sauce" })),
    });

    const app = createServer({ test: testRouter });
    expect(app).toBeDefined();
  });

  it("should support public and protected procedures pattern", () => {
    interface AppContext {
      user?: { id: string; name: string };
    }

    const baseRouter = new Router<AppContext>();

    // Public procedure (no middleware)
    const publicProcedure = baseRouter.procedure;

    // Protected procedure (with auth middleware)
    const protectedProcedure = baseRouter.procedure.use(async (opts) => {
      const { ctx } = opts;
      if (!ctx.user) {
        return new Response("Unauthorized", { status: 401 });
      }
      return opts.next({
        ctx: { user: ctx.user },
      });
    });

    const testRouter = router<AppContext>({
      "/hello": publicProcedure
        .output(z.string())
        .get(() => "hello world"),
      "/profile": protectedProcedure
        .output(z.object({ id: z.string(), name: z.string() }))
        .get(() => ({ id: "1", name: "Test User" })),
    });

    const app = createServer({ test: testRouter });
    expect(app).toBeDefined();
  });
});

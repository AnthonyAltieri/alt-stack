import { describe, it, expect, afterEach } from "bun:test";
import { z } from "zod";
import { createServer } from "./server.ts";
import { Router, router, ok, type BunBaseContext } from "./index.ts";

describe("createServer", () => {
  let server: ReturnType<typeof createServer> | null = null;

  afterEach(() => {
    server?.stop();
    server = null;
  });

  const getBaseUrl = () => `http://localhost:${server!.port}`;

  describe("basic routing", () => {
    it("should create a Bun server with GET route", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/hello": baseRouter.procedure
          .output(z.object({ message: z.string() }))
          .get(() => ok({ message: "Hello, World!" })),
      });

      server = createServer({ "/api": testRouter }, { port: 0 });
      const res = await fetch(`${getBaseUrl()}/api/hello`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ message: "Hello, World!" });
    });

    it("should create a Bun server with POST route", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/greet": baseRouter.procedure
          .input({ body: z.object({ name: z.string() }) })
          .output(z.object({ greeting: z.string() }))
          .post(({ input }) =>
            ok({
              greeting: `Hello, ${input.body.name}!`,
            }),
          ),
      });

      server = createServer({ "/api": testRouter }, { port: 0 });
      const res = await fetch(`${getBaseUrl()}/api/greet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice" }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ greeting: "Hello, Alice!" });
    });

    it("should handle PUT requests", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/items/{id}": baseRouter.procedure
          .input({
            params: z.object({ id: z.string() }),
            body: z.object({ name: z.string() }),
          })
          .output(z.object({ id: z.string(), name: z.string() }))
          .put(({ input }) =>
            ok({
              id: input.params.id,
              name: input.body.name,
            }),
          ),
      });

      server = createServer({ "/api": testRouter }, { port: 0 });
      const res = await fetch(`${getBaseUrl()}/api/items/456`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: "456", name: "Updated" });
    });

    it("should handle PATCH requests", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/items/{id}": baseRouter.procedure
          .input({
            params: z.object({ id: z.string() }),
            body: z.object({ completed: z.boolean() }),
          })
          .output(z.object({ id: z.string(), completed: z.boolean() }))
          .patch(({ input }) =>
            ok({
              id: input.params.id,
              completed: input.body.completed,
            }),
          ),
      });

      server = createServer({ "/api": testRouter }, { port: 0 });
      const res = await fetch(`${getBaseUrl()}/api/items/789`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: "789", completed: true });
    });

    it("should handle path parameters", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/items/{id}": baseRouter.procedure
          .input({ params: z.object({ id: z.string() }) })
          .output(z.object({ id: z.string() }))
          .get(({ input }) => ok({ id: input.params.id })),
      });

      server = createServer({ "/api": testRouter }, { port: 0 });
      const res = await fetch(`${getBaseUrl()}/api/items/123`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: "123" });
    });

    it("should handle query parameters", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/list": baseRouter.procedure
          .input({
            query: z.object({
              page: z.coerce.number().default(1),
              limit: z.coerce.number().default(10),
            }),
          })
          .output(z.object({ page: z.number(), limit: z.number() }))
          .get(({ input }) =>
            ok({
              page: input.query.page,
              limit: input.query.limit,
            }),
          ),
      });

      server = createServer({ "/api": testRouter }, { port: 0 });
      const res = await fetch(`${getBaseUrl()}/api/list?page=2&limit=20`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ page: 2, limit: 20 });
    });

    it("should return 404 for unknown routes", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/hello": baseRouter.procedure
          .output(z.object({ message: z.string() }))
          .get(() => ok({ message: "Hello" })),
      });

      server = createServer({ "/api": testRouter }, { port: 0 });
      const res = await fetch(`${getBaseUrl()}/api/unknown`);

      expect(res.status).toBe(404);
    });
  });

  describe("custom context", () => {
    it("should provide custom context to handlers", async () => {
      interface AppContext extends BunBaseContext {
        requestId: string;
      }

      const baseRouter = new Router<AppContext>();
      const testRouter = router<AppContext>({
        "/context": baseRouter.procedure
          .output(z.object({ requestId: z.string() }))
          .get(({ ctx }) => ok({ requestId: ctx.requestId })),
      });

      server = createServer<AppContext>(
        { "/api": testRouter },
        {
          port: 0,
          createContext: () => ({ requestId: "test-123" }),
        },
      );

      const res = await fetch(`${getBaseUrl()}/api/context`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ requestId: "test-123" });
    });

    it("should provide bun context to handlers (properly typed)", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/bun-ctx": baseRouter.procedure
          .output(z.object({ url: z.string() }))
          .get(({ ctx }) =>
            ok({
              // ctx.bun is properly typed - no casting needed!
              url: ctx.bun.req.url,
            }),
          ),
      });

      server = createServer({ "/api": testRouter }, { port: 0 });
      const res = await fetch(`${getBaseUrl()}/api/bun-ctx`);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toContain("/api/bun-ctx");
    });
  });

  describe("middleware", () => {
    it("should execute procedure-level middleware", async () => {
      interface AppContext extends BunBaseContext {
        user: { id: string } | null;
      }

      const baseRouter = new Router<AppContext>();
      const testRouter = router<AppContext>({
        "/protected": baseRouter.procedure
          .use(async ({ next }) => {
            // Simulate auth middleware - narrow user to non-null
            return next({ ctx: { user: { id: "user-1" } } });
          })
          .output(z.object({ userId: z.string() }))
          .get(({ ctx }) => ok({ userId: ctx.user!.id })),
      });

      server = createServer<AppContext>(
        { "/api": testRouter },
        { port: 0, createContext: () => ({ user: null }) },
      );

      const res = await fetch(`${getBaseUrl()}/api/protected`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ userId: "user-1" });
    });

    it("should allow middleware to throw for early exit", async () => {
      interface AppContext extends BunBaseContext {
        user: { id: string } | null;
      }

      const baseRouter = new Router<AppContext>();
      const testRouter = router<AppContext>({
        "/protected": baseRouter.procedure
          .use(async ({ ctx, next }) => {
            if (!ctx.user) {
              // Throw an error to trigger 500 response
              throw new Error("Unauthorized");
            }
            return next();
          })
          .output(z.object({ data: z.string() }))
          .get(() => ok({ data: "secret" })),
      });

      server = createServer<AppContext>(
        { "/api": testRouter },
        { port: 0, createContext: () => ({ user: null }) },
      );

      const res = await fetch(`${getBaseUrl()}/api/protected`);

      expect(res.status).toBe(500);
    });
  });

  describe("validation", () => {
    it("should return 400 for invalid body", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/validate": baseRouter.procedure
          .input({ body: z.object({ email: z.string().email() }) })
          .output(z.object({ email: z.string() }))
          .post(({ input }) => ok({ email: input.body.email })),
      });

      server = createServer({ "/api": testRouter }, { port: 0 });
      const res = await fetch(`${getBaseUrl()}/api/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invalid" }),
      });

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid params", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/items/{id}": baseRouter.procedure
          .input({ params: z.object({ id: z.string().uuid() }) })
          .output(z.object({ id: z.string() }))
          .get(({ input }) => ok({ id: input.params.id })),
      });

      server = createServer({ "/api": testRouter }, { port: 0 });
      const res = await fetch(`${getBaseUrl()}/api/items/not-a-uuid`);

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid query", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/list": baseRouter.procedure
          .input({ query: z.object({ page: z.coerce.number().min(1) }) })
          .output(z.object({ page: z.number() }))
          .get(({ input }) => ok({ page: input.query.page })),
      });

      server = createServer({ "/api": testRouter }, { port: 0 });
      const res = await fetch(`${getBaseUrl()}/api/list?page=0`);

      expect(res.status).toBe(400);
    });
  });

  describe("error handling", () => {
    it("should handle uncaught errors as 500", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/crash": baseRouter.procedure
          .output(z.object({ data: z.string() }))
          .get(() => {
            throw new Error("Unexpected error");
          }),
      });

      server = createServer({ "/api": testRouter }, { port: 0 });
      const res = await fetch(`${getBaseUrl()}/api/crash`);

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error.code).toBe("INTERNAL_SERVER_ERROR");
    });
  });

  describe("router function integration", () => {
    it("should work with router() function", async () => {
      const baseRouter = new Router();
      const r = router({
        "/hello": baseRouter.procedure
          .output(z.object({ msg: z.string() }))
          .get(() => ok({ msg: "hi" })),
      });

      server = createServer({ "/api": r }, { port: 0 });
      const res = await fetch(`${getBaseUrl()}/api/hello`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ msg: "hi" });
    });

    it("should work with methods object syntax", async () => {
      const baseRouter = new Router();
      const r = router({
        "/resource/{id}": {
          get: baseRouter.procedure
            .input({ params: z.object({ id: z.string() }) })
            .output(z.object({ id: z.string(), action: z.literal("get") }))
            .handler(({ input }) =>
              ok({ id: input.params.id, action: "get" as const }),
            ),
          delete: baseRouter.procedure
            .input({ params: z.object({ id: z.string() }) })
            .output(z.object({ id: z.string(), action: z.literal("delete") }))
            .handler(({ input }) =>
              ok({ id: input.params.id, action: "delete" as const }),
            ),
        },
      });

      server = createServer({ "/api": r }, { port: 0 });

      const getRes = await fetch(`${getBaseUrl()}/api/resource/123`);
      expect(getRes.status).toBe(200);
      expect(await getRes.json()).toEqual({ id: "123", action: "get" });

      const deleteRes = await fetch(`${getBaseUrl()}/api/resource/456`, {
        method: "DELETE",
      });
      expect(deleteRes.status).toBe(200);
      expect(await deleteRes.json()).toEqual({ id: "456", action: "delete" });
    });
  });

  describe("multiple routers", () => {
    it("should merge multiple routers under same prefix", async () => {
      const baseRouter = new Router();
      const usersRouter = router({
        "/users": baseRouter.procedure
          .output(z.array(z.object({ id: z.string() })))
          .get(() => ok([{ id: "1" }, { id: "2" }])),
      });

      const postsRouter = router({
        "/posts": baseRouter.procedure
          .output(z.array(z.object({ title: z.string() })))
          .get(() => ok([{ title: "Hello" }])),
      });

      server = createServer(
        {
          "/api": [usersRouter, postsRouter],
        },
        { port: 0 },
      );

      const usersRes = await fetch(`${getBaseUrl()}/api/users`);
      expect(usersRes.status).toBe(200);
      expect(await usersRes.json()).toEqual([{ id: "1" }, { id: "2" }]);

      const postsRes = await fetch(`${getBaseUrl()}/api/posts`);
      expect(postsRes.status).toBe(200);
      expect(await postsRes.json()).toEqual([{ title: "Hello" }]);
    });

    it("should handle multiple prefixes", async () => {
      const baseRouter = new Router();
      const v1Router = router({
        "/version": baseRouter.procedure
          .output(z.object({ version: z.literal("v1") }))
          .get(() => ok({ version: "v1" as const })),
      });

      const v2Router = router({
        "/version": baseRouter.procedure
          .output(z.object({ version: z.literal("v2") }))
          .get(() => ok({ version: "v2" as const })),
      });

      server = createServer(
        {
          "/api/v1": v1Router,
          "/api/v2": v2Router,
        },
        { port: 0 },
      );

      const v1Res = await fetch(`${getBaseUrl()}/api/v1/version`);
      expect(v1Res.status).toBe(200);
      expect(await v1Res.json()).toEqual({ version: "v1" });

      const v2Res = await fetch(`${getBaseUrl()}/api/v2/version`);
      expect(v2Res.status).toBe(200);
      expect(await v2Res.json()).toEqual({ version: "v2" });
    });
  });
});

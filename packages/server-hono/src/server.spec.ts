import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createServer } from "./server.js";
import { Router, router, ok, type HonoBaseContext } from "./index.js";

describe("createServer", () => {
  describe("basic routing", () => {
    it("should create a Hono app with GET route", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/hello": baseRouter.procedure
          .output(z.object({ message: z.string() }))
          .get(() => ok({ message: "Hello, World!" })),
      });

      const app = createServer({ "/api": testRouter });
      const res = await app.fetch(new Request("http://localhost/api/hello"));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ message: "Hello, World!" });
    });

    it("should create a Hono app with POST route", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/greet": baseRouter.procedure
          .input({ body: z.object({ name: z.string() }) })
          .output(z.object({ greeting: z.string() }))
          .post(({ input }) => ok({
            greeting: `Hello, ${input.body.name}!`,
          })),
      });

      const app = createServer({ "/api": testRouter });
      const res = await app.fetch(
        new Request("http://localhost/api/greet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Alice" }),
        }),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ greeting: "Hello, Alice!" });
    });

    it("should handle path parameters", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/items/{id}": baseRouter.procedure
          .input({ params: z.object({ id: z.string() }) })
          .output(z.object({ id: z.string() }))
          .get(({ input }) => ok({ id: input.params.id })),
      });

      const app = createServer({ "/api": testRouter });
      const res = await app.fetch(new Request("http://localhost/api/items/123"));

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
          .get(({ input }) => ok({
            page: input.query.page,
            limit: input.query.limit,
          })),
      });

      const app = createServer({ "/api": testRouter });
      const res = await app.fetch(
        new Request("http://localhost/api/list?page=2&limit=20"),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ page: 2, limit: 20 });
    });
  });

  describe("custom context", () => {
    it("should provide custom context to handlers", async () => {
      interface AppContext extends HonoBaseContext {
        requestId: string;
      }

      const baseRouter = new Router<AppContext>();
      const testRouter = router<AppContext>({
        "/context": baseRouter.procedure
          .output(z.object({ requestId: z.string() }))
          .get(({ ctx }) => ok({ requestId: ctx.requestId })),
      });

      const app = createServer<AppContext>(
        { "/api": testRouter },
        {
          createContext: () => ({ requestId: "test-123" }),
        },
      );

      const res = await app.fetch(new Request("http://localhost/api/context"));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ requestId: "test-123" });
    });

    it("should provide hono context to handlers", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/hono-ctx": baseRouter.procedure
          .output(z.object({ url: z.string() }))
          .get(({ ctx }) => ok({
            // Access hono context (added at runtime by createServer)
            url: (ctx as unknown as { hono: { req: { url: string } } }).hono.req.url,
          })),
      });

      const app = createServer({ "/api": testRouter });
      const res = await app.fetch(new Request("http://localhost/api/hono-ctx"));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toContain("/api/hono-ctx");
    });
  });

  describe("middleware", () => {
    it("should execute procedure-level middleware", async () => {
      interface AppContext extends HonoBaseContext {
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

      const app = createServer<AppContext>(
        { "/api": testRouter },
        { createContext: () => ({ user: null }) },
      );

      const res = await app.fetch(new Request("http://localhost/api/protected"));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ userId: "user-1" });
    });

    it("should allow middleware to throw for early exit", async () => {
      interface AppContext extends HonoBaseContext {
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

      const app = createServer<AppContext>(
        { "/api": testRouter },
        { createContext: () => ({ user: null }) },
      );

      const res = await app.fetch(new Request("http://localhost/api/protected"));

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

      const app = createServer({ "/api": testRouter });
      const res = await app.fetch(
        new Request("http://localhost/api/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "invalid" }),
        }),
      );

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

      const app = createServer({ "/api": testRouter });
      const res = await app.fetch(
        new Request("http://localhost/api/items/not-a-uuid"),
      );

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

      const app = createServer({ "/api": testRouter });
      const res = await app.fetch(new Request("http://localhost/api/crash"));

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

      const app = createServer({ "/api": r });
      const res = await app.fetch(new Request("http://localhost/api/hello"));

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
            .handler(({ input }) => ok({ id: input.params.id, action: "get" as const })),
          delete: baseRouter.procedure
            .input({ params: z.object({ id: z.string() }) })
            .output(z.object({ id: z.string(), action: z.literal("delete") }))
            .handler(({ input }) => ok({ id: input.params.id, action: "delete" as const })),
        },
      });

      const app = createServer({ "/api": r });

      const getRes = await app.fetch(
        new Request("http://localhost/api/resource/123"),
      );
      expect(getRes.status).toBe(200);
      expect(await getRes.json()).toEqual({ id: "123", action: "get" });

      const deleteRes = await app.fetch(
        new Request("http://localhost/api/resource/456", { method: "DELETE" }),
      );
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

      const app = createServer({
        "/api": [usersRouter, postsRouter],
      });

      const usersRes = await app.fetch(new Request("http://localhost/api/users"));
      expect(usersRes.status).toBe(200);
      expect(await usersRes.json()).toEqual([{ id: "1" }, { id: "2" }]);

      const postsRes = await app.fetch(new Request("http://localhost/api/posts"));
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

      const app = createServer({
        "/api/v1": v1Router,
        "/api/v2": v2Router,
      });

      const v1Res = await app.fetch(new Request("http://localhost/api/v1/version"));
      expect(v1Res.status).toBe(200);
      expect(await v1Res.json()).toEqual({ version: "v1" });

      const v2Res = await app.fetch(new Request("http://localhost/api/v2/version"));
      expect(v2Res.status).toBe(200);
      expect(await v2Res.json()).toEqual({ version: "v2" });
    });
  });
});

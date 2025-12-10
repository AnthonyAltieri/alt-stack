import { describe, it, expect } from "vitest";
import { z } from "zod";
import request from "supertest";
import { createServer } from "./server.js";
import { Router, router, ok } from "@alt-stack/server-core";

describe("createServer", () => {
  describe("basic routing", () => {
    it("should create an Express app with GET route", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/hello": baseRouter.procedure
          .output(z.object({ message: z.string() }))
          .get(() => ok({ message: "Hello, World!" })),
      });

      const app = createServer({ "/api": testRouter });
      const res = await request(app).get("/api/hello");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: "Hello, World!" });
    });

    it("should create an Express app with POST route", async () => {
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
      const res = await request(app).post("/api/greet").send({ name: "Alice" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ greeting: "Hello, Alice!" });
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
      const res = await request(app).get("/api/items/123");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: "123" });
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
      const res = await request(app).get("/api/list?page=2&limit=20");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ page: 2, limit: 20 });
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
          .put(({ input }) => ok({
            id: input.params.id,
            name: input.body.name,
          })),
      });

      const app = createServer({ "/api": testRouter });
      const res = await request(app).put("/api/items/456").send({ name: "Updated" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: "456", name: "Updated" });
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
          .patch(({ input }) => ok({
            id: input.params.id,
            completed: input.body.completed,
          })),
      });

      const app = createServer({ "/api": testRouter });
      const res = await request(app).patch("/api/items/789").send({ completed: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: "789", completed: true });
    });

    it("should handle DELETE requests", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/items/{id}": baseRouter.procedure
          .input({ params: z.object({ id: z.string() }) })
          .output(z.object({ success: z.boolean() }))
          .delete(() => ok({ success: true })),
      });

      const app = createServer({ "/api": testRouter });
      const res = await request(app).delete("/api/items/123");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });
  });

  describe("custom context", () => {
    it("should provide custom context to handlers", async () => {
      interface AppContext {
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

      const res = await request(app).get("/api/context");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ requestId: "test-123" });
    });

    it("should provide express context to handlers", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/express-ctx": baseRouter.procedure
          .output(z.object({ method: z.string() }))
          .get(({ ctx }) => ok({
            // Access express context (added at runtime by createServer)
            method: (ctx as unknown as { express: { req: { method: string } } }).express.req.method,
          })),
      });

      const app = createServer({ "/api": testRouter });
      const res = await request(app).get("/api/express-ctx");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ method: "GET" });
    });
  });

  describe("middleware", () => {
    it("should execute procedure-level middleware", async () => {
      interface AppContext {
        user: { id: string } | null;
      }

      const baseRouter = new Router<AppContext>();
      const testRouter = router<AppContext>({
        "/protected": baseRouter.procedure
          .use(async ({ next }) => {
            // Simulate auth middleware
            return next({ ctx: { user: { id: "user-1" } } });
          })
          .output(z.object({ userId: z.string() }))
          .get(({ ctx }) => ok({ userId: ctx.user!.id })),
      });

      const app = createServer<AppContext>(
        { "/api": testRouter },
        { createContext: () => ({ user: null }) },
      );

      const res = await request(app).get("/api/protected");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ userId: "user-1" });
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
      const res = await request(app).post("/api/validate").send({ email: "invalid" });

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
      const res = await request(app).get("/api/items/not-a-uuid");

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

      const app = createServer({ "/api": testRouter });
      const res = await request(app).get("/api/list?page=0");

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
      const res = await request(app).get("/api/crash");

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_SERVER_ERROR");
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
      const res = await request(app).get("/api/hello");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ msg: "hi" });
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

      const getRes = await request(app).get("/api/resource/123");
      expect(getRes.status).toBe(200);
      expect(getRes.body).toEqual({ id: "123", action: "get" });

      const deleteRes = await request(app).delete("/api/resource/456");
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body).toEqual({ id: "456", action: "delete" });
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

      const usersRes = await request(app).get("/api/users");
      expect(usersRes.status).toBe(200);
      expect(usersRes.body).toEqual([{ id: "1" }, { id: "2" }]);

      const postsRes = await request(app).get("/api/posts");
      expect(postsRes.status).toBe(200);
      expect(postsRes.body).toEqual([{ title: "Hello" }]);
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

      const v1Res = await request(app).get("/api/v1/version");
      expect(v1Res.body).toEqual({ version: "v1" });

      const v2Res = await request(app).get("/api/v2/version");
      expect(v2Res.body).toEqual({ version: "v2" });
    });
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { SpanStatusCode } from "@opentelemetry/api";
import { z } from "zod";
import { createServer } from "./server.js";
import { Router, router, ok, err, initTelemetry, type HonoBaseContext } from "./index.js";

describe("Hono telemetry", () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeAll(async () => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.register();

    // Initialize telemetry to load the OTel API
    await initTelemetry();
  });

  beforeEach(() => {
    exporter.reset();
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  describe("successful requests", () => {
    it("creates span with correct name and attributes for GET request", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/users/{id}": baseRouter.procedure
          .input({ params: z.object({ id: z.string() }) })
          .output(z.object({ id: z.string() }))
          .get(({ input }) => ok({ id: input.params.id })),
      });

      const app = createServer({ "/api": testRouter }, { telemetry: true });
      const res = await app.fetch(new Request("http://localhost/api/users/123"));

      expect(res.status).toBe(200);

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe("GET /api/users/{id}");
      expect(spans[0].attributes["http.request.method"]).toBe("GET");
      expect(spans[0].attributes["http.route"]).toBe("/api/users/{id}");
      expect(spans[0].attributes["url.path"]).toBe("/api/users/123");
      expect(spans[0].attributes["http.response.status_code"]).toBe(200);
      expect(spans[0].status.code).toBe(SpanStatusCode.OK);
    });

    it("creates span for POST request", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/items": baseRouter.procedure
          .input({ body: z.object({ name: z.string() }) })
          .output(z.object({ name: z.string() }))
          .post(({ input }) => ok({ name: input.body.name })),
      });

      const app = createServer({ "/api": testRouter }, { telemetry: true });
      const res = await app.fetch(
        new Request("http://localhost/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test" }),
        }),
      );

      expect(res.status).toBe(200);

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe("POST /api/items");
      expect(spans[0].attributes["http.response.status_code"]).toBe(200);
    });
  });

  describe("error responses", () => {
    it("sets status code on span for handler errors", async () => {
      class NotFoundError extends Error {
        readonly _tag = "NotFoundError";
        constructor(message: string) {
          super(message);
          this.name = "NotFoundError";
        }
      }

      const baseRouter = new Router();
      const testRouter = router({
        "/users/{id}": baseRouter.procedure
          .input({ params: z.object({ id: z.string() }) })
          .output(z.object({ id: z.string() }))
          .errors({ 404: z.object({ _tag: z.literal("NotFoundError"), message: z.string() }) })
          .get(() => err(new NotFoundError("User not found"))),
      });

      const app = createServer({ "/api": testRouter }, { telemetry: true });
      const res = await app.fetch(new Request("http://localhost/api/users/999"));

      expect(res.status).toBe(404);

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].attributes["http.response.status_code"]).toBe(404);
    });

    it("sets status code 400 on validation error", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/items/{id}": baseRouter.procedure
          .input({ params: z.object({ id: z.string().uuid() }) })
          .output(z.object({ id: z.string() }))
          .get(({ input }) => ok({ id: input.params.id })),
      });

      const app = createServer({ "/api": testRouter }, { telemetry: true });
      const res = await app.fetch(new Request("http://localhost/api/items/not-a-uuid"));

      expect(res.status).toBe(400);

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].attributes["http.response.status_code"]).toBe(400);
    });

    it("records exception and sets status code 500 on uncaught error", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/crash": baseRouter.procedure
          .output(z.object({ data: z.string() }))
          .get(() => {
            throw new Error("Unexpected error");
          }),
      });

      const app = createServer({ "/api": testRouter }, { telemetry: true });
      const res = await app.fetch(new Request("http://localhost/api/crash"));

      expect(res.status).toBe(500);

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].attributes["http.response.status_code"]).toBe(500);
      expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);

      // Check exception was recorded
      const events = spans[0].events;
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].name).toBe("exception");
    });
  });

  describe("ignored routes", () => {
    it("does not create span for ignored routes", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/health": baseRouter.procedure
          .output(z.object({ status: z.literal("ok") }))
          .get(() => ok({ status: "ok" as const })),
        "/users": baseRouter.procedure
          .output(z.array(z.object({ id: z.string() })))
          .get(() => ok([{ id: "1" }])),
      });

      const app = createServer(
        { "/api": testRouter },
        {
          telemetry: {
            enabled: true,
            ignoreRoutes: ["/api/health"],
          },
        },
      );

      // Request to ignored route
      const healthRes = await app.fetch(new Request("http://localhost/api/health"));
      expect(healthRes.status).toBe(200);

      // Request to normal route
      const usersRes = await app.fetch(new Request("http://localhost/api/users"));
      expect(usersRes.status).toBe(200);

      // Only one span should exist (for /users)
      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe("GET /api/users");
    });

    it("ignores sub-paths of ignored routes", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/internal/status": baseRouter.procedure
          .output(z.object({ status: z.string() }))
          .get(() => ok({ status: "running" })),
        "/internal/status/db": baseRouter.procedure
          .output(z.object({ connected: z.boolean() }))
          .get(() => ok({ connected: true })),
      });

      const app = createServer(
        { "/api": testRouter },
        {
          telemetry: {
            enabled: true,
            ignoreRoutes: ["/api/internal/status"],
          },
        },
      );

      await app.fetch(new Request("http://localhost/api/internal/status"));
      await app.fetch(new Request("http://localhost/api/internal/status/db"));

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(0);
    });
  });

  describe("disabled telemetry", () => {
    it("does not create spans when telemetry is disabled", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/hello": baseRouter.procedure
          .output(z.object({ message: z.string() }))
          .get(() => ok({ message: "Hello" })),
      });

      const app = createServer({ "/api": testRouter }, { telemetry: false });
      const res = await app.fetch(new Request("http://localhost/api/hello"));

      expect(res.status).toBe(200);

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(0);
    });

    it("does not create spans when telemetry option is omitted", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/hello": baseRouter.procedure
          .output(z.object({ message: z.string() }))
          .get(() => ok({ message: "Hello" })),
      });

      const app = createServer({ "/api": testRouter });
      const res = await app.fetch(new Request("http://localhost/api/hello"));

      expect(res.status).toBe(200);

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(0);
    });
  });

  describe("span in handler context", () => {
    it("provides span in ctx when telemetry is enabled", async () => {
      let receivedSpan: unknown = null;

      const baseRouter = new Router();
      const testRouter = router({
        "/with-span": baseRouter.procedure
          .output(z.object({ hasSpan: z.boolean() }))
          .get(({ ctx }) => {
            receivedSpan = ctx.span;
            return ok({ hasSpan: !!ctx.span });
          }),
      });

      const app = createServer({ "/api": testRouter }, { telemetry: true });
      const res = await app.fetch(new Request("http://localhost/api/with-span"));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ hasSpan: true });
      expect(receivedSpan).toBeDefined();
    });

    it("span is undefined when telemetry is disabled", async () => {
      let receivedSpan: unknown = "not-set";

      const baseRouter = new Router();
      const testRouter = router({
        "/without-span": baseRouter.procedure
          .output(z.object({ hasSpan: z.boolean() }))
          .get(({ ctx }) => {
            receivedSpan = ctx.span;
            return ok({ hasSpan: !!ctx.span });
          }),
      });

      const app = createServer({ "/api": testRouter }, { telemetry: false });
      const res = await app.fetch(new Request("http://localhost/api/without-span"));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ hasSpan: false });
      expect(receivedSpan).toBeUndefined();
    });

    it("allows adding custom attributes to span from handler", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/custom-attrs": baseRouter.procedure
          .output(z.object({ success: z.boolean() }))
          .get(({ ctx }) => {
            ctx.span?.setAttribute("custom.user_id", "user-123");
            ctx.span?.setAttribute("custom.action", "test");
            return ok({ success: true });
          }),
      });

      const app = createServer({ "/api": testRouter }, { telemetry: true });
      const res = await app.fetch(new Request("http://localhost/api/custom-attrs"));

      expect(res.status).toBe(200);

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].attributes["custom.user_id"]).toBe("user-123");
      expect(spans[0].attributes["custom.action"]).toBe("test");
    });
  });

  describe("custom service name", () => {
    it("uses custom service name from config", async () => {
      const baseRouter = new Router();
      const testRouter = router({
        "/test": baseRouter.procedure
          .output(z.object({ ok: z.boolean() }))
          .get(() => ok({ ok: true })),
      });

      const app = createServer(
        { "/api": testRouter },
        {
          telemetry: {
            enabled: true,
            serviceName: "my-hono-api",
          },
        },
      );

      await app.fetch(new Request("http://localhost/api/test"));

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].instrumentationScope.name).toBe("my-hono-api");
    });
  });
});

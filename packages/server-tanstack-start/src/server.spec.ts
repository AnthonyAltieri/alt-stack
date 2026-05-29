import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  TaggedError,
  createRequestHandler,
  createRouteHandlers,
  createServerRoute,
  err,
  init,
  ok,
  router,
  tanStackPathToOpenApiPath,
} from "./index.js";
import type { TanStackBaseContext } from "./index.js";

interface AppContext extends TanStackBaseContext {
  user?: { id: string };
}

const factory = init<AppContext>();
const procedure = factory.procedure;

function request(url = "http://localhost/api/todos/123", init?: RequestInit): Request {
  return new Request(url, init);
}

async function json(response: Response): Promise<any> {
  return response.json();
}

describe("TanStack Start server adapter", () => {
  it("converts TanStack route params to OpenAPI-style params", () => {
    expect(tanStackPathToOpenApiPath("/api/users/$id/files/$")).toBe(
      "/api/users/{id}/files/{_splat}",
    );
  });

  it("creates idiomatic server.handlers for createFileRoute server routes", async () => {
    const server = createServerRoute("/api/todos/$id", {
      get: procedure
        .input({
          params: z.object({ id: z.string() }),
          query: z.object({ includeCompleted: z.enum(["true", "false"]) }),
        })
        .output(z.object({ id: z.string(), includeCompleted: z.boolean() }))
        .handler(({ input, ctx }) =>
          ok({
            id: input.params.id,
            includeCompleted: input.query.includeCompleted === "true",
            requestUrl: ctx.tanstack.request.url,
          }),
        ),
    });

    const response = await server.handlers.GET!({
      request: request("http://localhost/api/todos/abc?includeCompleted=true"),
      params: { id: "abc" },
      context: {},
    });

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({
      id: "abc",
      includeCompleted: true,
    });
  });

  it("validates JSON request bodies", async () => {
    const server = createServerRoute("/api/todos", {
      post: procedure
        .input({
          body: z.object({ title: z.string().min(1) }),
        })
        .output(z.object({ title: z.string() }))
        .handler(({ input }) => ok({ title: input.body.title })),
    });

    const response = await server.handlers.POST!({
      request: request("http://localhost/api/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Ship adapter" }),
      }),
      params: {},
      context: {},
    });

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({ title: "Ship adapter" });
  });

  it("returns a validation error response for invalid input", async () => {
    const server = createServerRoute("/api/todos", {
      post: procedure
        .input({
          body: z.object({ title: z.string().min(1) }),
        })
        .handler(() => ok({ unreachable: true })),
    });

    const response = await server.handlers.POST!({
      request: request("http://localhost/api/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "" }),
      }),
      params: {},
      context: {},
    });

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("maps typed Alt Stack errors to declared HTTP statuses", async () => {
    class NotFoundError extends TaggedError {
      readonly _tag = "NotFoundError" as const;

      constructor(public readonly resourceId: string) {
        super(`Resource ${resourceId} not found`);
      }
    }

    const server = createServerRoute("/api/todos/$id", {
      get: procedure
        .input({ params: z.object({ id: z.string() }) })
        .errors({
          404: z.object({
            _tag: z.literal("NotFoundError"),
            resourceId: z.string(),
          }),
        })
        .handler(({ input }) => err(new NotFoundError(input.params.id))),
    });

    const response = await server.handlers.GET!({
      request: request(),
      params: { id: "missing" },
      context: {},
    });

    expect(response.status).toBe(404);
    await expect(json(response)).resolves.toEqual({
      error: {
        code: "NotFoundError",
        message: "Resource missing not found",
        _tag: "NotFoundError",
        resourceId: "missing",
      },
    });
  });

  it("runs middleware and exposes custom TanStack context", async () => {
    const authed = procedure.use(async ({ ctx, next }) => {
      return next({ ctx: { user: { id: ctx.tanstack.params.id ?? "unknown" } } });
    });

    const server = createServerRoute("/api/users/$id", {
      get: authed
        .input({ params: z.object({ id: z.string() }) })
        .output(
          z.object({
            userId: z.string(),
            fromRouteContext: z.string(),
            fromCustomContext: z.string(),
          }),
        )
        .handler(({ ctx }) =>
          ok({
            userId: ctx.user!.id,
            fromRouteContext: (ctx.tanstack.context as { source: string }).source,
            fromCustomContext: ctx.user!.id,
          }),
        ),
    });

    const response = await server.handlers.GET!({
      request: request("http://localhost/api/users/u_123"),
      params: { id: "u_123" },
      context: { source: "tanstack" },
    });

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({
      userId: "u_123",
      fromRouteContext: "tanstack",
      fromCustomContext: "u_123",
    });
  });

  it("supports createContext for app-specific context", async () => {
    const server = createServerRoute(
      "/api/me",
      {
        get: procedure
          .output(z.object({ userId: z.string() }))
          .handler(({ ctx }) => ok({ userId: ctx.user!.id })),
      },
      {
        createContext: () => ({ user: { id: "from-create-context" } }),
      },
    );

    const response = await server.handlers.GET!({
      request: request("http://localhost/api/me"),
      params: {},
      context: {},
    });

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({
      userId: "from-create-context",
    });
  });

  it("passes Response results through unchanged", async () => {
    const server = createServerRoute("/api/export", {
      get: procedure.handler(() =>
        ok(new Response("csv-data", { status: 201 })),
      ),
    });

    const response = await server.handlers.GET!({
      request: request("http://localhost/api/export"),
      params: {},
      context: {},
    });

    expect(response.status).toBe(201);
    await expect(response.text()).resolves.toBe("csv-data");
  });

  it("dispatches request handlers and returns 405 for unsupported methods", async () => {
    const appRouter = router<AppContext>({
      "/api/status": {
        get: procedure
          .output(z.object({ ok: z.boolean() }))
          .handler(() => ok({ ok: true })),
      },
    });
    const handler = createRequestHandler(appRouter);

    const response = await handler({
      request: request("http://localhost/api/status", { method: "POST" }),
      params: {},
      context: {},
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });

  it("can create handlers from a prefixed router config", async () => {
    const todosRouter = router<AppContext>({
      "/": {
        get: procedure
          .output(z.object({ route: z.literal("todos") }))
          .handler(() => ok({ route: "todos" as const })),
      },
    });

    const server = createRouteHandlers<AppContext>({
      "/api/todos": todosRouter,
    });

    const response = await server.handlers.GET!({
      request: request("http://localhost/api/todos"),
      params: {},
      context: {},
    });

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({ route: "todos" });
  });

  it("requires params schemas for TanStack dynamic route segments", () => {
    const _server = createServerRoute("/api/todos/$id", {
      // @ts-expect-error - dynamic `$id` routes require an `input.params.id` schema
      get: procedure
        .output(z.object({ id: z.string() }))
        .handler(() => ok({ id: "missing-schema" })),
    });

    expect(_server.handlers.GET).toBeDefined();
  });
});

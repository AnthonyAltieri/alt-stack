import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  TaggedError,
  createAltStackFileRoute,
  err,
  generateOpenAPISpecFromServerRoutes,
  init,
  ok,
  tanStackPathToOpenApiPath,
} from "./index.js";
import type { AnyRoute } from "@tanstack/react-router";
import type { TanStackBaseContext } from "./index.js";

type TestFileRoute = {
  parentRoute: AnyRoute;
  id: string;
  path: string;
  fullPath: string;
  preLoaderRoute: AnyRoute;
};

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/api/todos": TestFileRoute;
    "/api/todos/$id": TestFileRoute;
    "/api/users/$id": TestFileRoute;
    "/api/me": TestFileRoute;
    "/api/export": TestFileRoute;
  }
}

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
    const todoRoute = createAltStackFileRoute("/api/todos/$id")({
      server: {
        handlers: {
          GET: procedure
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
        },
      },
    });

    expect(todoRoute.altStack.path).toBe("/api/todos/$id");

    const response = await todoRoute.altStack.server.handlers.GET!({
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

  it("keeps the TanStack file route and Alt Stack metadata together", () => {
    const Route = createAltStackFileRoute("/api/todos/$id")({
      server: {
        handlers: {
          GET: procedure
            .input({ params: z.object({ id: z.string() }) })
            .handler(({ input }) => ok({ id: input.params.id })),
        },
      },
    });

    expect(Route.altStack.path).toBe("/api/todos/$id");
    expect(Route.altStack.server.handlers.GET).toBeDefined();
    expect(Route.altStack.router.getProcedures()[0]?.path).toBe("/api/todos/{id}");
  });

  it("generates OpenAPI docs from defined server routes", () => {
    const listTodosRoute = createAltStackFileRoute("/api/todos")({
      server: {
        handlers: {
          GET: procedure
            .output(z.array(z.object({ id: z.string(), title: z.string() })))
            .handler(() => ok([])),
        },
      },
    });
    const getTodoRoute = createAltStackFileRoute("/api/todos/$id")({
      server: {
        handlers: {
          GET: procedure
            .input({ params: z.object({ id: z.string() }) })
            .output(z.object({ id: z.string(), title: z.string() }))
            .handler(({ input }) =>
              ok({ id: input.params.id, title: "Ship adapter" }),
            ),
        },
      },
    });

    const spec = generateOpenAPISpecFromServerRoutes(
      [listTodosRoute, getTodoRoute],
      {
        title: "Todos API",
        version: "1.0.0",
      },
    );

    expect(spec.info).toEqual({ title: "Todos API", version: "1.0.0" });
    expect(Object.keys(spec.paths).sort()).toEqual([
      "/api/todos",
      "/api/todos/{id}",
    ]);
    expect(spec.paths["/api/todos"]?.get?.operationId).toBe("getApiTodos");
    expect(spec.paths["/api/todos/{id}"]?.get?.parameters).toEqual([
      expect.objectContaining({
        in: "path",
        name: "id",
        required: true,
      }),
    ]);
  });

  it("validates JSON request bodies", async () => {
    const route = createAltStackFileRoute("/api/todos")({
      server: {
        handlers: {
          POST: procedure
            .input({
              body: z.object({ title: z.string().min(1) }),
            })
            .output(z.object({ title: z.string() }))
            .handler(({ input }) => ok({ title: input.body.title })),
        },
      },
    });

    const response = await route.altStack.server.handlers.POST!({
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
    const route = createAltStackFileRoute("/api/todos")({
      server: {
        handlers: {
          POST: procedure
            .input({
              body: z.object({ title: z.string().min(1) }),
            })
            .handler(() => ok({ unreachable: true })),
        },
      },
    });

    const response = await route.altStack.server.handlers.POST!({
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

    const route = createAltStackFileRoute("/api/todos/$id")({
      server: {
        handlers: {
          GET: procedure
            .input({ params: z.object({ id: z.string() }) })
            .errors({
              404: z.object({
                _tag: z.literal("NotFoundError"),
                resourceId: z.string(),
              }),
            })
            .handler(({ input }) => err(new NotFoundError(input.params.id))),
        },
      },
    });

    const response = await route.altStack.server.handlers.GET!({
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

    const route = createAltStackFileRoute("/api/users/$id")({
      server: {
        handlers: {
          GET: authed
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
        },
      },
    });

    const response = await route.altStack.server.handlers.GET!({
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
    const route = createAltStackFileRoute("/api/me")({
      server: {
        createContext: () => ({ user: { id: "from-create-context" } }),
        handlers: {
          GET: procedure
            .output(z.object({ userId: z.string() }))
            .handler(({ ctx }) => ok({ userId: ctx.user!.id })),
        },
      },
    });

    const response = await route.altStack.server.handlers.GET!({
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
    const route = createAltStackFileRoute("/api/export")({
      server: {
        handlers: {
          GET: procedure.handler(() =>
            ok(new Response("csv-data", { status: 201 })),
          ),
        },
      },
    });

    const response = await route.altStack.server.handlers.GET!({
      request: request("http://localhost/api/export"),
      params: {},
      context: {},
    });

    expect(response.status).toBe(201);
    await expect(response.text()).resolves.toBe("csv-data");
  });

  it("passes non-handler route and server options through to TanStack", () => {
    const component = () => null;
    const route = createAltStackFileRoute("/api/todos")({
      component,
      staticData: { section: "todos" },
      server: {
        extraServerOption: "kept",
        handlers: {
          GET: procedure.handler(() => ok({ todos: [] })),
        },
      },
    });

    expect((route as any).options.component).toBe(component);
    expect((route as any).options.staticData).toEqual({ section: "todos" });
    expect((route as any).options.server.extraServerOption).toBe("kept");
    expect((route as any).options.server.handlers.GET).toBe(
      route.altStack.server.handlers.GET,
    );
  });

  it("requires params schemas for TanStack dynamic route segments", () => {
    const _route = createAltStackFileRoute("/api/todos/$id")({
      server: {
        handlers: {
          // @ts-expect-error - dynamic `$id` routes require an `input.params.id` schema
          GET: procedure
            .output(z.object({ id: z.string() }))
            .handler(() => ok({ id: "missing-schema" })),
        },
      },
    });

    expect(_route.altStack.server.handlers.GET).toBeDefined();
  });
});

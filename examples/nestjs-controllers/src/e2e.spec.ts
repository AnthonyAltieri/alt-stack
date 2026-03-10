import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";

type DispatchOptions = {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
};

async function dispatch(
  app: unknown,
  options: DispatchOptions,
): Promise<{ status: number; body: any; text: string }> {
  const socket = new PassThrough();
  (socket as any).remoteAddress = "127.0.0.1";
  (socket as any).remotePort = 0;
  const req = new http.IncomingMessage(socket as any);
  req.method = options.method;
  req.url = options.url;
  req.headers = { host: "localhost", ...options.headers } as any;
  (req as any).originalUrl = options.url;

  let payload: string | undefined;
  if (options.body !== undefined) {
    payload = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    req.headers["content-type"] = req.headers["content-type"] ?? "application/json";
    req.headers["content-length"] = String(Buffer.byteLength(payload));
  }

  const res = new http.ServerResponse(req);
  res.assignSocket(socket as any);

  const chunks: Buffer[] = [];
  const originalWrite = res.write.bind(res);
  res.write = (chunk: any, ...args: any[]) => {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return originalWrite(chunk, ...args);
  };

  const originalEnd = res.end.bind(res);
  res.end = (chunk?: any, ...args: any[]) => {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return originalEnd(chunk, ...args);
  };

  const handler = "handle" in (app as any) ? (app as any).handle.bind(app) : app;

  await new Promise<void>((resolve, reject) => {
    res.on("finish", resolve);
    try {
      if (typeof (app as any).emit === "function") {
        (app as any).emit("request", req, res);
      } else {
        handler(req, res, (error: unknown) => {
          if (error) {
            reject(error);
          }
        });
      }
    } catch (error) {
      reject(error);
      return;
    }

    setImmediate(() => {
      if (payload) {
        req.emit("data", Buffer.from(payload));
      }
      req.emit("end");
    });
  });

  const text = Buffer.concat(chunks).toString("utf8");
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return {
    status: res.statusCode,
    body,
    text,
  };
}

const aliceHeaders = { "x-user-id": "u-alice" };
const bobHeaders = { "x-user-id": "u-bob" };
const unknownHeaders = { "x-user-id": "does-not-exist" };

type VariantName = "controller" | "altStack" | "altStackResult";
type VariantResponse = Awaited<ReturnType<typeof dispatch>>;
type VariantFixture = {
  name: VariantName;
  app: any;
  server: any;
};

async function dispatchAll(
  fixtures: VariantFixture[],
  options: DispatchOptions,
): Promise<Record<VariantName, VariantResponse>> {
  return Object.fromEntries(
    await Promise.all(
      fixtures.map(async (fixture) => [fixture.name, await dispatch(fixture.server, options)] as const),
    ),
  ) as Record<VariantName, VariantResponse>;
}

describe("NestJS controller replacement example", () => {
  let fixtures: VariantFixture[] = [];

  beforeEach(async () => {
    const { createControllerApp } = await import("../dist/controller-app.js");
    const { createAltStackApp } = await import("../dist/alt-stack-app.js");
    const { createAltStackResultApp } = await import("../dist/alt-stack-result-app.js");
    const controllerApp = await createControllerApp();
    const altStackApp = await createAltStackApp();
    const altStackResultApp = await createAltStackResultApp();
    fixtures = [
      { name: "controller", app: controllerApp, server: controllerApp.getHttpServer() },
      { name: "altStack", app: altStackApp, server: altStackApp.getHttpServer() },
      { name: "altStackResult", app: altStackResultApp, server: altStackResultApp.getHttpServer() },
    ];
  });

  afterEach(async () => {
    await Promise.all(fixtures.map(async (fixture) => fixture.app.close()));
    fixtures = [];
  });

  it("lists tasks with matching filtered payloads", async () => {
    const responses = await dispatchAll(fixtures, {
      method: "GET",
      url: "/v1/api/tasks?status=todo&assigneeId=u-bob&limit=1",
    });

    expect(responses.controller.status).toBe(200);
    expect(responses.altStack.status).toBe(200);
    expect(responses.altStackResult.status).toBe(200);
    expect(responses.altStack.body).toEqual(responses.controller.body);
    expect(responses.altStackResult.body).toEqual(responses.controller.body);
  });

  it("matches query validation failures", async () => {
    const responses = await dispatchAll(fixtures, {
      method: "GET",
      url: "/v1/api/tasks?limit=0",
    });

    expect(responses.controller.status).toBe(400);
    expect(responses.altStack.status).toBe(400);
    expect(responses.altStackResult.status).toBe(400);
  });

  it("creates a task through a multi-service route", async () => {
    const payload = {
      title: "Write migration guide",
      description: "Explain the example move and package rename.",
      priority: "high",
    };

    const responses = await dispatchAll(fixtures, {
      method: "POST",
      url: "/v1/api/tasks",
      headers: aliceHeaders,
      body: payload,
    });

    expect(responses.controller.status).toBe(201);
    expect(responses.altStack.status).toBe(200);
    expect(responses.altStackResult.status).toBe(200);
    expect(responses.controller.body).toMatchObject({
      title: payload.title,
      priority: payload.priority,
      ownerId: "u-alice",
      assigneeId: null,
      status: "todo",
    });
    expect(responses.altStack.body).toMatchObject({
      title: payload.title,
      priority: payload.priority,
      ownerId: "u-alice",
      assigneeId: null,
      status: "todo",
    });
    expect(responses.altStackResult.body).toMatchObject({
      title: payload.title,
      priority: payload.priority,
      ownerId: "u-alice",
      assigneeId: null,
      status: "todo",
    });
  });

  it("rejects invalid create payloads in both implementations", async () => {
    const responses = await dispatchAll(fixtures, {
      method: "POST",
      url: "/v1/api/tasks",
      headers: aliceHeaders,
      body: { title: "", priority: "urgent" },
    });

    expect(responses.controller.status).toBe(400);
    expect(responses.altStack.status).toBe(400);
    expect(responses.altStackResult.status).toBe(400);
  });

  it("returns matching 404 behavior for a missing task", async () => {
    const responses = await dispatchAll(fixtures, {
      method: "GET",
      url: "/v1/api/tasks/task-missing",
    });

    expect(responses.controller.status).toBe(404);
    expect(responses.altStack.status).toBe(404);
    expect(responses.altStackResult.status).toBe(404);
    expect(responses.controller.body).toEqual({
      error: "Not Found",
      message: "Task task-missing was not found",
      statusCode: 404,
    });
    expect(responses.altStack.body).toEqual({
      error: { _tag: "NotFoundError", code: "NotFoundError", message: "Task task-missing was not found" },
    });
    expect(responses.altStackResult.body).toEqual({
      error: { _tag: "NotFoundError", code: "NotFoundError", message: "Task task-missing was not found" },
    });
  });

  it("assigns a task through a route that coordinates multiple services", async () => {
    const responses = await dispatchAll(fixtures, {
      method: "POST",
      url: "/v1/api/tasks/task-1/assign",
      headers: aliceHeaders,
      body: { assigneeId: "u-chris" },
    });

    expect(responses.controller.status).toBe(201);
    expect(responses.altStack.status).toBe(200);
    expect(responses.altStackResult.status).toBe(200);
    expect(responses.controller.body.assigneeId).toBe("u-chris");
    expect(responses.altStack.body.assigneeId).toBe("u-chris");
    expect(responses.altStackResult.body.assigneeId).toBe("u-chris");
  });

  it("rejects assignment to an unknown user", async () => {
    const responses = await dispatchAll(fixtures, {
      method: "POST",
      url: "/v1/api/tasks/task-1/assign",
      headers: aliceHeaders,
      body: { assigneeId: "u-missing" },
    });

    expect(responses.controller.status).toBe(404);
    expect(responses.altStack.status).toBe(404);
    expect(responses.altStackResult.status).toBe(404);
  });

  it("rejects assignment by an unauthorized caller", async () => {
    const responses = await dispatchAll(fixtures, {
      method: "POST",
      url: "/v1/api/tasks/task-1/assign",
      headers: bobHeaders,
      body: { assigneeId: "u-chris" },
    });

    expect(responses.controller.status).toBe(403);
    expect(responses.altStack.status).toBe(403);
    expect(responses.altStackResult.status).toBe(403);
  });

  it("allows a valid status transition by the assignee", async () => {
    await dispatchAll(fixtures, {
      method: "POST",
      url: "/v1/api/tasks/task-1/assign",
      headers: aliceHeaders,
      body: { assigneeId: "u-bob" },
    });

    const responses = await dispatchAll(fixtures, {
      method: "PATCH",
      url: "/v1/api/tasks/task-1",
      headers: bobHeaders,
      body: { status: "in_progress" },
    });

    expect(responses.controller.status).toBe(200);
    expect(responses.altStack.status).toBe(200);
    expect(responses.altStackResult.status).toBe(200);
    expect(responses.controller.body.status).toBe("in_progress");
    expect(responses.altStack.body.status).toBe("in_progress");
    expect(responses.altStackResult.body.status).toBe("in_progress");
  });

  it("rejects invalid transitions with matching conflict semantics", async () => {
    const responses = await dispatchAll(fixtures, {
      method: "PATCH",
      url: "/v1/api/tasks/task-1",
      headers: bobHeaders,
      body: { status: "completed" },
    });

    expect(responses.controller.status).toBe(409);
    expect(responses.altStack.status).toBe(409);
    expect(responses.altStackResult.status).toBe(409);
    expect(responses.altStackResult.body).toEqual(responses.altStack.body);
  });

  it("rejects unknown callers consistently", async () => {
    const responses = await dispatchAll(fixtures, {
      method: "POST",
      url: "/v1/api/tasks",
      headers: unknownHeaders,
      body: { title: "Should fail", priority: "low" },
    });

    expect(responses.controller.status).toBe(401);
    expect(responses.altStack.status).toBe(401);
    expect(responses.altStackResult.status).toBe(401);
  });
});

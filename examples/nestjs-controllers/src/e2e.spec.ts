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

describe("NestJS controller replacement example", () => {
  let controllerApp: any;
  let altStackApp: any;
  let controllerServer: any;
  let altStackServer: any;

  beforeEach(async () => {
    const { createControllerApp } = await import("../dist/controller-app.js");
    const { createAltStackApp } = await import("../dist/alt-stack-app.js");
    controllerApp = await createControllerApp();
    altStackApp = await createAltStackApp();
    controllerServer = controllerApp.getHttpServer();
    altStackServer = altStackApp.getHttpServer();
  });

  afterEach(async () => {
    await controllerApp.close();
    await altStackApp.close();
  });

  it("lists tasks with matching filtered payloads", async () => {
    const controllerRes = await dispatch(controllerServer, {
      method: "GET",
      url: "/v1/api/tasks?status=todo&assigneeId=u-bob&limit=1",
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "GET",
      url: "/v1/api/tasks?status=todo&assigneeId=u-bob&limit=1",
    });

    expect(controllerRes.status).toBe(200);
    expect(altStackRes.status).toBe(200);
    expect(altStackRes.body).toEqual(controllerRes.body);
  });

  it("matches query validation failures", async () => {
    const controllerRes = await dispatch(controllerServer, {
      method: "GET",
      url: "/v1/api/tasks?limit=0",
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "GET",
      url: "/v1/api/tasks?limit=0",
    });

    expect(controllerRes.status).toBe(400);
    expect(altStackRes.status).toBe(400);
  });

  it("creates a task through a multi-service route", async () => {
    const payload = {
      title: "Write migration guide",
      description: "Explain the example move and package rename.",
      priority: "high",
    };

    const controllerRes = await dispatch(controllerServer, {
      method: "POST",
      url: "/v1/api/tasks",
      headers: aliceHeaders,
      body: payload,
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "POST",
      url: "/v1/api/tasks",
      headers: aliceHeaders,
      body: payload,
    });

    expect(controllerRes.status).toBe(201);
    expect(altStackRes.status).toBe(200);
    expect(altStackRes.body).toMatchObject({
      title: payload.title,
      priority: payload.priority,
      ownerId: "u-alice",
      assigneeId: null,
      status: "todo",
    });
    expect(controllerRes.body).toMatchObject({
      title: payload.title,
      priority: payload.priority,
      ownerId: "u-alice",
      assigneeId: null,
      status: "todo",
    });
  });

  it("rejects invalid create payloads in both implementations", async () => {
    const controllerRes = await dispatch(controllerServer, {
      method: "POST",
      url: "/v1/api/tasks",
      headers: aliceHeaders,
      body: { title: "", priority: "urgent" },
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "POST",
      url: "/v1/api/tasks",
      headers: aliceHeaders,
      body: { title: "", priority: "urgent" },
    });

    expect(controllerRes.status).toBe(400);
    expect(altStackRes.status).toBe(400);
  });

  it("returns matching 404 behavior for a missing task", async () => {
    const controllerRes = await dispatch(controllerServer, {
      method: "GET",
      url: "/v1/api/tasks/task-missing",
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "GET",
      url: "/v1/api/tasks/task-missing",
    });

    expect(controllerRes.status).toBe(404);
    expect(altStackRes.status).toBe(404);
    expect(controllerRes.body).toEqual({
      error: "Not Found",
      message: "Task task-missing was not found",
      statusCode: 404,
    });
    expect(altStackRes.body).toEqual({
      error: { _tag: "NotFoundError", code: "NotFoundError", message: "Task task-missing was not found" },
    });
  });

  it("assigns a task through a route that coordinates multiple services", async () => {
    const controllerRes = await dispatch(controllerServer, {
      method: "POST",
      url: "/v1/api/tasks/task-1/assign",
      headers: aliceHeaders,
      body: { assigneeId: "u-chris" },
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "POST",
      url: "/v1/api/tasks/task-1/assign",
      headers: aliceHeaders,
      body: { assigneeId: "u-chris" },
    });

    expect(controllerRes.status).toBe(201);
    expect(altStackRes.status).toBe(200);
    expect(controllerRes.body.assigneeId).toBe("u-chris");
    expect(altStackRes.body.assigneeId).toBe("u-chris");
  });

  it("rejects assignment to an unknown user", async () => {
    const controllerRes = await dispatch(controllerServer, {
      method: "POST",
      url: "/v1/api/tasks/task-1/assign",
      headers: aliceHeaders,
      body: { assigneeId: "u-missing" },
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "POST",
      url: "/v1/api/tasks/task-1/assign",
      headers: aliceHeaders,
      body: { assigneeId: "u-missing" },
    });

    expect(controllerRes.status).toBe(404);
    expect(altStackRes.status).toBe(404);
  });

  it("rejects assignment by an unauthorized caller", async () => {
    const controllerRes = await dispatch(controllerServer, {
      method: "POST",
      url: "/v1/api/tasks/task-1/assign",
      headers: bobHeaders,
      body: { assigneeId: "u-chris" },
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "POST",
      url: "/v1/api/tasks/task-1/assign",
      headers: bobHeaders,
      body: { assigneeId: "u-chris" },
    });

    expect(controllerRes.status).toBe(403);
    expect(altStackRes.status).toBe(403);
  });

  it("allows a valid status transition by the assignee", async () => {
    await dispatch(controllerServer, {
      method: "POST",
      url: "/v1/api/tasks/task-1/assign",
      headers: aliceHeaders,
      body: { assigneeId: "u-bob" },
    });
    await dispatch(altStackServer, {
      method: "POST",
      url: "/v1/api/tasks/task-1/assign",
      headers: aliceHeaders,
      body: { assigneeId: "u-bob" },
    });

    const controllerRes = await dispatch(controllerServer, {
      method: "PATCH",
      url: "/v1/api/tasks/task-1",
      headers: bobHeaders,
      body: { status: "in_progress" },
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "PATCH",
      url: "/v1/api/tasks/task-1",
      headers: bobHeaders,
      body: { status: "in_progress" },
    });

    expect(controllerRes.status).toBe(200);
    expect(altStackRes.status).toBe(200);
    expect(controllerRes.body.status).toBe("in_progress");
    expect(altStackRes.body.status).toBe("in_progress");
  });

  it("rejects invalid transitions with matching conflict semantics", async () => {
    const controllerRes = await dispatch(controllerServer, {
      method: "PATCH",
      url: "/v1/api/tasks/task-1",
      headers: bobHeaders,
      body: { status: "completed" },
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "PATCH",
      url: "/v1/api/tasks/task-1",
      headers: bobHeaders,
      body: { status: "completed" },
    });

    expect(controllerRes.status).toBe(409);
    expect(altStackRes.status).toBe(409);
  });

  it("rejects unknown callers consistently", async () => {
    const controllerRes = await dispatch(controllerServer, {
      method: "POST",
      url: "/v1/api/tasks",
      headers: unknownHeaders,
      body: { title: "Should fail", priority: "low" },
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "POST",
      url: "/v1/api/tasks",
      headers: unknownHeaders,
      body: { title: "Should fail", priority: "low" },
    });

    expect(controllerRes.status).toBe(401);
    expect(altStackRes.status).toBe(401);
  });
});

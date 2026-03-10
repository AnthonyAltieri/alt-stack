import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { createAltStackApp } from "./alt-stack-app.js";
import { createControllerApp } from "./controller-app.js";

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

describe("NestJS controller replacement example", () => {
  let controllerApp: any;
  let altStackApp: any;
  let controllerServer: any;
  let altStackServer: any;

  beforeAll(async () => {
    controllerApp = await createControllerApp();
    altStackApp = await createAltStackApp();
    controllerServer = controllerApp.getHttpServer();
    altStackServer = altStackApp.getHttpServer();
  });

  afterAll(async () => {
    await controllerApp.close();
    await altStackApp.close();
  });

  it("returns the same payload for path params", async () => {
    const controllerRes = await dispatch(controllerServer, {
      method: "GET",
      url: "/v1/api/users/123",
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "GET",
      url: "/v1/api/users/123",
    });

    expect(controllerRes.status).toBe(200);
    expect(altStackRes.status).toBe(200);
    expect(altStackRes.body).toEqual(controllerRes.body);
  });

  it("matches query validation status codes", async () => {
    const controllerRes = await dispatch(controllerServer, {
      method: "GET",
      url: "/v1/api/query?limit=0",
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "GET",
      url: "/v1/api/query?limit=0",
    });

    expect(controllerRes.status).toBe(400);
    expect(altStackRes.status).toBe(400);
  });

  it("matches body validation status codes", async () => {
    const controllerRes = await dispatch(controllerServer, {
      method: "POST",
      url: "/v1/api/items",
      body: { name: "" },
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "POST",
      url: "/v1/api/items",
      body: { name: "" },
    });

    expect(controllerRes.status).toBe(400);
    expect(altStackRes.status).toBe(400);
  });

  it("returns the same payload for valid POST bodies", async () => {
    const controllerRes = await dispatch(controllerServer, {
      method: "POST",
      url: "/v1/api/items",
      body: { name: "widget" },
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "POST",
      url: "/v1/api/items",
      body: { name: "widget" },
    });

    expect(controllerRes.status).toBe(201);
    expect(altStackRes.status).toBe(200);
    expect(controllerRes.body).toEqual(altStackRes.body);
  });

  it("returns 404 from both implementations", async () => {
    const controllerRes = await dispatch(controllerServer, {
      method: "GET",
      url: "/v1/api/error",
    });
    const altStackRes = await dispatch(altStackServer, {
      method: "GET",
      url: "/v1/api/error",
    });

    expect(controllerRes.status).toBe(404);
    expect(altStackRes.status).toBe(404);
    expect(altStackRes.body).toEqual({
      error: { _tag: "NotFoundError", code: "NotFoundError", message: "missing" },
    });
  });
});

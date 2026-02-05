import "reflect-metadata";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import http from "node:http";
import { PassThrough } from "node:stream";
import { z } from "zod";
import { Injectable, Module, Scope } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  TaggedError,
  createMiddlewareWithErrors,
  createNestMiddleware,
  err,
  init,
  ok,
  registerAltStack,
  router,
} from "./index.js";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError" as const;
  constructor(message = "Not found") {
    super(message);
  }
}

class UnauthorizedError extends TaggedError {
  readonly _tag = "UnauthorizedError" as const;
  constructor(message = "Unauthorized") {
    super(message);
  }
}

@Injectable()
class UsersService {
  findById(id: string) {
    return { id, name: `User ${id}` };
  }
}

let requestIdCounter = 0;

@Injectable({ scope: Scope.REQUEST })
class RequestContextService {
  readonly id = ++requestIdCounter;
}

@Module({
  providers: [UsersService, RequestContextService],
  exports: [UsersService, RequestContextService],
})
class AppModule {}

type DispatchOptions = {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
};

async function dispatch(
  app: Express,
  options: DispatchOptions,
): Promise<{ status: number; body: string; headers: Record<string, string | string[]> }> {
  const socket = new PassThrough();
  (socket as any).remoteAddress = "127.0.0.1";
  (socket as any).remotePort = 0;
  const req = new http.IncomingMessage(socket as any);
  req.method = options.method;
  req.url = options.url;
  const headerOverrides = options.headers ?? {};
  req.headers = { host: "localhost", ...headerOverrides } as any;

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
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return originalWrite(chunk, ...args);
  };

  const originalEnd = res.end.bind(res);
  res.end = (chunk?: any, ...args: any[]) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return originalEnd(chunk, ...args);
  };

  const handler = "handle" in app ? (app as any).handle.bind(app) : (app as any);

  await new Promise<void>((resolve, reject) => {
    res.on("finish", resolve);
    handler(req, res, (error: unknown) => {
      if (error) reject(error);
    });

    setImmediate(() => {
      if (payload) {
        req.emit("data", Buffer.from(payload));
      }
      req.emit("end");
    });
  });

  return {
    status: res.statusCode,
    body: Buffer.concat(chunks).toString("utf8"),
    headers: res.getHeaders() as Record<string, string | string[]>,
  };
}

describe("NestJS E2E with Alt Stack router", () => {
  let app: any;
  let expressApp: Express;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    expressApp = app.getHttpAdapter().getInstance();

    const authMiddleware = createMiddlewareWithErrors<any>()
      .errors({ 401: z.object({ _tag: z.literal("UnauthorizedError") }) })
      .fn(async ({ ctx, next }) => {
        if (ctx.express.req.path.startsWith("/docs")) {
          return next();
        }
        const headerValue = ctx.express.req.headers["x-user-id"];
        if (!headerValue || Array.isArray(headerValue)) {
          return err(new UnauthorizedError());
        }
        return next({ ctx: { user: { id: headerValue } } });
      });

    expressApp.use("/api", createNestMiddleware(app, authMiddleware));

    const factory = init<{ user?: { id: string } }>();
    const apiRouter = router({
      "/users/{id}": factory.procedure
        .input({ params: z.object({ id: z.string() }) })
        .output(z.object({ id: z.string(), name: z.string() }))
        .get(({ ctx, input }) => {
          const users = ctx.nest.get(UsersService);
          return ok(users.findById(input.params.id));
        }),
      "/me": factory.procedure
        .output(z.object({ id: z.string() }))
        .get(({ ctx }) => ok({ id: ctx.user?.id ?? "missing" })),
      "/scoped": factory.procedure
        .output(z.object({ requestId: z.number() }))
        .get(async ({ ctx }) => {
          const scoped = await ctx.nest.resolve(RequestContextService);
          return ok({ requestId: scoped.id });
        }),
      "/items": factory.procedure
        .input({ body: z.object({ name: z.string() }) })
        .output(z.object({ id: z.string(), name: z.string() }))
        .post(({ input }) =>
          ok({ id: `item-${input.body.name}`, name: input.body.name }),
        ),
      "/query": factory.procedure
        .input({ query: z.object({ limit: z.coerce.number().min(1) }) })
        .output(z.object({ limit: z.number() }))
        .get(({ input }) => ok({ limit: input.query.limit })),
      "/error": factory.procedure
        .errors({
          404: z.object({ _tag: z.literal("NotFoundError"), message: z.string() }),
        })
        .get(() => err(new NotFoundError("missing"))),
    });

    registerAltStack(app, { "/": apiRouter }, { mountPath: "/api" });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("uses Nest DI in handlers and middleware context override", async () => {
    const res = await dispatch(expressApp, {
      method: "GET",
      url: "/api/users/123",
      headers: { "x-user-id": "u1" },
    });

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ id: "123", name: "User 123" });
  });

  it("rejects requests without auth header via middleware", async () => {
    const res = await dispatch(expressApp, { method: "GET", url: "/api/me" });
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body)).toEqual({
      error: { _tag: "UnauthorizedError", code: "UnauthorizedError", message: "Unauthorized" },
    });
  });

  it("propagates middleware ctx to handler", async () => {
    const res = await dispatch(expressApp, {
      method: "GET",
      url: "/api/me",
      headers: { "x-user-id": "u-42" },
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ id: "u-42" });
  });

  it("resolves request-scoped providers per request", async () => {
    const first = await dispatch(expressApp, {
      method: "GET",
      url: "/api/scoped",
      headers: { "x-user-id": "u1" },
    });
    const second = await dispatch(expressApp, {
      method: "GET",
      url: "/api/scoped",
      headers: { "x-user-id": "u1" },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const firstId = JSON.parse(first.body).requestId as number;
    const secondId = JSON.parse(second.body).requestId as number;
    expect(firstId).not.toBe(secondId);
  });

  it("returns validation errors for query input", async () => {
    const queryRes = await dispatch(expressApp, {
      method: "GET",
      url: "/api/query?limit=0",
      headers: { "x-user-id": "u1" },
    });
    expect(queryRes.status).toBe(400);
  });

  it("returns validation errors for body input", async () => {
    const bodyRes = await dispatch(expressApp, {
      method: "POST",
      url: "/api/items",
      headers: { "x-user-id": "u1" },
      body: { name: 123 },
    });
    expect(bodyRes.status).toBe(400);
  });

  it("maps handler errors to typed HTTP status", async () => {
    const res = await dispatch(expressApp, {
      method: "GET",
      url: "/api/error",
      headers: { "x-user-id": "u1" },
    });
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({
      error: { _tag: "NotFoundError", code: "NotFoundError", message: "missing" },
    });
  });
});

import "reflect-metadata";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { z } from "zod";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
  Scope,
} from "@nestjs/common";
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
  type NestBaseContext,
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

const QuerySchema = z.object({
  limit: z.coerce.number().min(1),
});

const BodySchema = z.object({
  name: z.string(),
});

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

@Controller("controller")
class LegacyController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get("users/:id")
  getUser(@Param("id") id: string) {
    return this.usersService.findById(id);
  }

  @Get("query")
  getQuery(@Query() query: Record<string, unknown>) {
    const parsed = QuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return { limit: parsed.data.limit };
  }

  @Post("items")
  createItem(@Body() body: unknown) {
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return { id: `item-${parsed.data.name}`, name: parsed.data.name };
  }

  @Get("error")
  getError() {
    throw new NotFoundException("missing");
  }
}

@Controller({ path: "controller-scoped", scope: Scope.REQUEST })
class ScopedLegacyController {
  constructor(
    @Inject(RequestContextService)
    private readonly requestContext: RequestContextService,
  ) {}

  @Get("request-id")
  getRequestId() {
    return { requestId: this.requestContext.id };
  }
}

@Module({
  controllers: [LegacyController, ScopedLegacyController],
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
  app: any,
  options: DispatchOptions,
): Promise<{ status: number; body: any; text: string; headers: Record<string, string | string[]> }> {
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

  const handler = "handle" in app ? app.handle.bind(app) : app;

  await new Promise<void>((resolve, reject) => {
    res.on("finish", resolve);
    try {
      if (typeof app.emit === "function") {
        app.emit("request", req, res);
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
    headers: res.getHeaders() as Record<string, string | string[]>,
  };
}

describe("NestJS E2E with Alt Stack router", () => {
  let app: any;
  let server: any;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix("v1");
    const expressApp = app.getHttpAdapter().getInstance();

    const authMiddleware = createMiddlewareWithErrors<NestBaseContext>()
      .errors({
        401: z.object({ _tag: z.literal("UnauthorizedError") }),
      })
      .fn(async ({ ctx, next }) => {
        const headerValue = ctx.express.req.headers["x-user-id"];
        if (!headerValue || Array.isArray(headerValue)) {
          return err(new UnauthorizedError());
        }

        const scoped = await ctx.nest.resolve<RequestContextService>(RequestContextService);
        return next({
          ctx: {
            user: { id: headerValue },
            middlewareRequestId: scoped.id,
          },
        });
      });

    expressApp.use("/v1/api", createNestMiddleware(app, authMiddleware));

    const factory = init<{
      user?: { id: string };
      middlewareRequestId?: number;
    }>();

    const apiRouter = router<NestBaseContext & {
      user?: { id: string };
      middlewareRequestId?: number;
    }>({
      "/users/{id}": factory.procedure
        .input({ params: z.object({ id: z.string() }) })
        .output(z.object({ id: z.string(), name: z.string() }))
        .get(({ ctx, input }) => {
          const users = ctx.nest.get<UsersService>(UsersService);
          return ok(users.findById(input.params.id));
        }),
      "/me": factory.procedure
        .output(z.object({ id: z.string() }))
        .get(({ ctx }) => ok({ id: ctx.user?.id ?? "missing" })),
      "/scoped": factory.procedure
        .output(
          z.object({
            middlewareRequestId: z.number(),
            handlerRequestId: z.number(),
            sameRequestScope: z.boolean(),
          }),
        )
        .get(async ({ ctx }) => {
          const scoped = await ctx.nest.resolve<RequestContextService>(RequestContextService);
          return ok({
            middlewareRequestId: ctx.middlewareRequestId ?? -1,
            handlerRequestId: scoped.id,
            sameRequestScope: ctx.middlewareRequestId === scoped.id,
          });
        }),
      "/double-resolve": factory.procedure
        .output(
          z.object({
            firstRequestId: z.number(),
            secondRequestId: z.number(),
            sameRequestScope: z.boolean(),
          }),
        )
        .get(async ({ ctx }) => {
          const first = await ctx.nest.resolve<RequestContextService>(RequestContextService);
          const second = await ctx.nest.resolve<RequestContextService>(RequestContextService);
          return ok({
            firstRequestId: first.id,
            secondRequestId: second.id,
            sameRequestScope: first.id === second.id,
          });
        }),
      "/items": factory.procedure
        .input({ body: BodySchema })
        .output(z.object({ id: z.string(), name: z.string() }))
        .post(({ input }) =>
          ok({ id: `item-${input.body.name}`, name: input.body.name }),
        ),
      "/query": factory.procedure
        .input({ query: QuerySchema })
        .output(z.object({ limit: z.number() }))
        .get(({ input }) => ok({ limit: input.query.limit })),
      "/error": factory.procedure
        .errors({
          404: z.object({ _tag: z.literal("NotFoundError"), message: z.string() }),
        })
        .get(() => err(new NotFoundError("missing"))),
    });

    const dedupeRouter = router({
      "/ping": factory.procedure
        .output(z.object({ ok: z.literal(true) }))
        .get(() => ok({ ok: true as const })),
    });

    registerAltStack(app, { "/": apiRouter }, { mountPath: "/api" });
    registerAltStack(app, { "/": dedupeRouter }, { mountPath: "/v1/dedup" });

    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it("coexists with conventional controller routes under the Nest global prefix", async () => {
    const legacy = await dispatch(server, {
      method: "GET",
      url: "/v1/controller/users/123",
    });
    const alt = await dispatch(server, {
      method: "GET",
      url: "/v1/api/users/123",
      headers: { "x-user-id": "u1" },
    });

    expect(legacy.status).toBe(200);
    expect(alt.status).toBe(200);
    expect(legacy.body).toEqual(alt.body);
  });

  it("matches controller validation and not-found status behavior", async () => {
    const legacyQuery = await dispatch(server, {
      method: "GET",
      url: "/v1/controller/query?limit=0",
    });
    const altQuery = await dispatch(server, {
      method: "GET",
      url: "/v1/api/query?limit=0",
      headers: { "x-user-id": "u1" },
    });

    const legacyBody = await dispatch(server, {
      method: "POST",
      url: "/v1/controller/items",
      body: { name: 123 },
    });
    const altBody = await dispatch(server, {
      method: "POST",
      url: "/v1/api/items",
      headers: { "x-user-id": "u1" },
      body: { name: 123 },
    });

    const legacyError = await dispatch(server, {
      method: "GET",
      url: "/v1/controller/error",
    });
    const altError = await dispatch(server, {
      method: "GET",
      url: "/v1/api/error",
      headers: { "x-user-id": "u1" },
    });

    expect(legacyQuery.status).toBe(400);
    expect(altQuery.status).toBe(400);
    expect(legacyBody.status).toBe(400);
    expect(altBody.status).toBe(400);
    expect(legacyError.status).toBe(404);
    expect(altError.status).toBe(404);
    expect(altError.body).toEqual({
      error: { _tag: "NotFoundError", code: "NotFoundError", message: "missing" },
    });
  });

  it("rejects requests without auth header via Nest middleware", async () => {
    const res = await dispatch(server, {
      method: "GET",
      url: "/v1/api/me",
    });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { _tag: "UnauthorizedError", code: "UnauthorizedError", message: "Unauthorized" },
    });
  });

  it("propagates middleware ctx to the handler", async () => {
    const res = await dispatch(server, {
      method: "GET",
      url: "/v1/api/me",
      headers: { "x-user-id": "u-42" },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "u-42" });
  });

  it("reuses the same request-scoped provider across middleware and handler", async () => {
    const first = await dispatch(server, {
      method: "GET",
      url: "/v1/api/scoped",
      headers: { "x-user-id": "u1" },
    });
    const second = await dispatch(server, {
      method: "GET",
      url: "/v1/api/scoped",
      headers: { "x-user-id": "u1" },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const firstBody = first.body as {
      middlewareRequestId: number;
      handlerRequestId: number;
      sameRequestScope: boolean;
    };
    const secondBody = second.body as typeof firstBody;

    expect(firstBody.sameRequestScope).toBe(true);
    expect(firstBody.middlewareRequestId).toBe(firstBody.handlerRequestId);
    expect(secondBody.sameRequestScope).toBe(true);
    expect(firstBody.handlerRequestId).not.toBe(secondBody.handlerRequestId);
  });

  it("reuses the same request-scoped provider for multiple resolve() calls in one handler", async () => {
    const res = await dispatch(server, {
      method: "GET",
      url: "/v1/api/double-resolve",
      headers: { "x-user-id": "u1" },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      firstRequestId: expect.any(Number),
      secondRequestId: expect.any(Number),
      sameRequestScope: true,
    });
  });

  it("does not double-prefix mount paths that already include the global prefix", async () => {
    const expected = await dispatch(server, {
      method: "GET",
      url: "/v1/dedup/ping",
    });
    const doublePrefixed = await dispatch(server, {
      method: "GET",
      url: "/v1/v1/dedup/ping",
    });

    expect(expected.status).toBe(200);
    expect(expected.body).toEqual({ ok: true });
    expect(doublePrefixed.status).toBe(404);
  });

  it("matches request-scoped controller behavior on the same Nest app", async () => {
    const first = await dispatch(server, {
      method: "GET",
      url: "/v1/controller-scoped/request-id",
    });
    const second = await dispatch(server, {
      method: "GET",
      url: "/v1/controller-scoped/request-id",
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.requestId).not.toBe(second.body.requestId);
  });
});

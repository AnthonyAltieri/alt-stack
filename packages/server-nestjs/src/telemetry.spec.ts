import { createRequire } from "node:module";
import http from "node:http";
import { PassThrough } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { z } from "zod";
import { SpanStatusCode } from "@opentelemetry/api";
import { init, initTelemetry, ok, registerAltStack, router } from "./index.js";

const requireFromServerCore = createRequire(
  new URL("../../server-core/package.json", import.meta.url),
);
const { NodeTracerProvider } = requireFromServerCore("@opentelemetry/sdk-trace-node") as {
  NodeTracerProvider: new (options: { spanProcessors: unknown[] }) => {
    register(): void;
    shutdown(): Promise<void>;
  };
};
const {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} = requireFromServerCore("@opentelemetry/sdk-trace-base") as {
  InMemorySpanExporter: new () => {
    reset(): void;
    getFinishedSpans(): Array<any>;
  };
  SimpleSpanProcessor: new (exporter: unknown) => unknown;
};

describe("NestJS telemetry (Express platform)", () => {
  let exporter: InstanceType<typeof InMemorySpanExporter>;
  let provider: InstanceType<typeof NodeTracerProvider>;

  beforeAll(async () => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.register();

    await initTelemetry();
  });

  beforeEach(() => {
    exporter.reset();
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  async function dispatch(app: any, method: string, url: string): Promise<{ status: number }> {
    const socket = new PassThrough();
    const req = new http.IncomingMessage(socket as any);
    req.method = method;
    req.url = url;
    req.headers = { host: "localhost" } as any;
    (req as any).originalUrl = url;

    const res = new http.ServerResponse(req);
    res.assignSocket(socket as any);

    await new Promise<void>((resolve, reject) => {
      res.on("finish", resolve);
      try {
        if (typeof app.emit === "function") {
          app.emit("request", req, res);
        } else {
          app(req, res, (error: unknown) => (error ? reject(error) : undefined));
        }
      } catch (error) {
        reject(error);
        return;
      }
      setImmediate(() => req.emit("end"));
    });

    return { status: res.statusCode };
  }

  it("creates spans with the effective mount path in http.route", async () => {
    const nestExpress = express();
    const server = http.createServer(nestExpress);
    const nestApp = {
      getHttpAdapter: () => ({ getInstance: () => nestExpress }),
      get: () => ({}),
      config: {
        getGlobalPrefix: () => "v1",
      },
    };

    const factory = init();
    const apiRouter = router({
      "/users/{id}": factory.procedure
        .input({ params: z.object({ id: z.string() }) })
        .output(z.object({ id: z.string() }))
        .get(({ input }) => ok({ id: input.params.id })),
    });

    registerAltStack(
      nestApp as any,
      { "/": apiRouter as any },
      { mountPath: "/api", telemetry: true },
    );

    const res = await dispatch(server, "GET", "/v1/api/users/123");
    expect(res.status).toBe(200);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const span = spans[0]!;
    expect(span.name).toBe("GET /v1/api/users/{id}");
    expect(span.attributes["http.request.method"]).toBe("GET");
    expect(span.attributes["http.route"]).toBe("/v1/api/users/{id}");
    expect(span.attributes["url.path"]).toBe("/v1/api/users/123");
    expect(span.attributes["http.response.status_code"]).toBe(200);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });
});

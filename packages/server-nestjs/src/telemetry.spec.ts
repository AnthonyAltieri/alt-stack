import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import http from "node:http";
import { PassThrough } from "node:stream";
import { z } from "zod";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { SpanStatusCode } from "@opentelemetry/api";
import { init, ok, registerAltStack, router, initTelemetry } from "./index.js";

async function dispatch(app: any, method: string, url: string): Promise<{ status: number }> {
  const socket = new PassThrough();
  const req = new http.IncomingMessage(socket as any);
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost" } as any;

  const res = new http.ServerResponse(req);
  res.assignSocket(socket as any);

  await new Promise<void>((resolve, reject) => {
    res.on("finish", resolve);
    app(req, res, (err: unknown) => (err ? reject(err) : undefined));
  });

  return { status: res.statusCode };
}

describe("NestJS telemetry (Express platform)", () => {
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

  it("creates spans with mountPath included in http.route + url.path", async () => {
    const nestExpress = express();
    const nestApp = {
      getHttpAdapter: () => ({ getInstance: () => nestExpress }),
      get: () => ({}),
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

    const res = await dispatch(nestExpress, "GET", "/api/users/123");
    expect(res.status).toBe(200);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const span = spans[0]!;
    expect(span.name).toBe("GET /api/users/{id}");
    expect(span.attributes["http.request.method"]).toBe("GET");
    expect(span.attributes["http.route"]).toBe("/api/users/{id}");
    expect(span.attributes["url.path"]).toBe("/api/users/123");
    expect(span.attributes["http.response.status_code"]).toBe(200);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });
});

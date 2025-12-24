import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { SpanStatusCode } from "@opentelemetry/api";
import {
  createRequestSpan,
  endSpanWithError,
  setSpanOk,
  initTelemetry,
  resolveTelemetryConfig,
} from "./telemetry.js";

describe("telemetry integration", () => {
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

  describe("createRequestSpan", () => {
    it("creates span with correct name", () => {
      const config = resolveTelemetryConfig(true);
      const span = createRequestSpan("GET", "/users/{id}", "/users/123", config);

      expect(span).toBeDefined();
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe("GET /users/{id}");
    });

    it("sets correct span attributes", () => {
      const config = resolveTelemetryConfig(true);
      const span = createRequestSpan("POST", "/api/items", "/api/items", config);

      expect(span).toBeDefined();
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const attributes = spans[0].attributes;
      expect(attributes["http.request.method"]).toBe("POST");
      expect(attributes["http.route"]).toBe("/api/items");
      expect(attributes["url.path"]).toBe("/api/items");
    });

    it("uses custom service name from config", () => {
      const config = resolveTelemetryConfig({
        enabled: true,
        serviceName: "my-custom-service",
      });
      const span = createRequestSpan("GET", "/test", "/test", config);

      expect(span).toBeDefined();
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      // The tracer name should match the service name
      expect(spans[0].instrumentationScope.name).toBe("my-custom-service");
    });
  });

  describe("setSpanOk", () => {
    it("sets span status to OK", () => {
      const config = resolveTelemetryConfig(true);
      const span = createRequestSpan("GET", "/health", "/health", config);

      setSpanOk(span);
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].status.code).toBe(SpanStatusCode.OK);
    });

    it("handles undefined span gracefully", () => {
      // Should not throw
      expect(() => setSpanOk(undefined)).not.toThrow();
    });
  });

  describe("endSpanWithError", () => {
    it("sets span status to ERROR", () => {
      const config = resolveTelemetryConfig(true);
      const span = createRequestSpan("GET", "/fail", "/fail", config);

      endSpanWithError(span, new Error("Something went wrong"));
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    });

    it("records exception on span", () => {
      const config = resolveTelemetryConfig(true);
      const span = createRequestSpan("POST", "/error", "/error", config);

      const error = new Error("Test error message");
      endSpanWithError(span, error);
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const events = spans[0].events;
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe("exception");
      expect(events[0].attributes?.["exception.message"]).toBe("Test error message");
    });

    it("handles string errors", () => {
      const config = resolveTelemetryConfig(true);
      const span = createRequestSpan("GET", "/string-error", "/string-error", config);

      endSpanWithError(span, "String error");
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);

      const events = spans[0].events;
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe("exception");
    });

    it("handles undefined span gracefully", () => {
      // Should not throw
      expect(() => endSpanWithError(undefined, new Error("test"))).not.toThrow();
    });
  });

  describe("span attributes", () => {
    it("can set additional attributes on span", () => {
      const config = resolveTelemetryConfig(true);
      const span = createRequestSpan("GET", "/users", "/users", config);

      span?.setAttribute("http.response.status_code", 200);
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].attributes["http.response.status_code"]).toBe(200);
    });
  });
});

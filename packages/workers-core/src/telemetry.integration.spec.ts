import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { SpanStatusCode, SpanKind } from "@opentelemetry/api";
import {
  createJobSpan,
  endSpanWithError,
  setSpanOk,
  setJobStatus,
  initWorkerTelemetry,
  resolveWorkerTelemetryConfig,
  shouldIgnoreJob,
} from "./telemetry.js";

describe("worker telemetry integration", () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeAll(async () => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.register();

    // Initialize telemetry to load the OTel API
    await initWorkerTelemetry();
  });

  beforeEach(() => {
    exporter.reset();
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  describe("resolveWorkerTelemetryConfig", () => {
    it("returns disabled config for undefined", () => {
      const config = resolveWorkerTelemetryConfig(undefined);
      expect(config.enabled).toBe(false);
      expect(config.serviceName).toBe("altstack-worker");
      expect(config.ignoreJobs).toEqual([]);
    });

    it("returns disabled config for false", () => {
      const config = resolveWorkerTelemetryConfig(false);
      expect(config.enabled).toBe(false);
    });

    it("returns enabled config with defaults for true", () => {
      const config = resolveWorkerTelemetryConfig(true);
      expect(config.enabled).toBe(true);
      expect(config.serviceName).toBe("altstack-worker");
      expect(config.ignoreJobs).toEqual([]);
    });

    it("uses custom config values", () => {
      const config = resolveWorkerTelemetryConfig({
        enabled: true,
        serviceName: "my-worker",
        ignoreJobs: ["health-check", "metrics"],
      });
      expect(config.enabled).toBe(true);
      expect(config.serviceName).toBe("my-worker");
      expect(config.ignoreJobs).toEqual(["health-check", "metrics"]);
    });
  });

  describe("shouldIgnoreJob", () => {
    it("returns true for jobs in ignoreJobs list", () => {
      const config = resolveWorkerTelemetryConfig({
        enabled: true,
        ignoreJobs: ["health-check", "metrics-poll"],
      });
      expect(shouldIgnoreJob("health-check", config)).toBe(true);
      expect(shouldIgnoreJob("metrics-poll", config)).toBe(true);
    });

    it("returns false for jobs not in ignoreJobs list", () => {
      const config = resolveWorkerTelemetryConfig({
        enabled: true,
        ignoreJobs: ["health-check"],
      });
      expect(shouldIgnoreJob("send-email", config)).toBe(false);
      expect(shouldIgnoreJob("process-order", config)).toBe(false);
    });
  });

  describe("createJobSpan", () => {
    it("creates span with correct name", () => {
      const config = resolveWorkerTelemetryConfig(true);
      const span = createJobSpan("send-welcome-email", "job-123", 1, config);

      expect(span).toBeDefined();
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0]!.name).toBe("job send-welcome-email");
    });

    it("sets correct span attributes", () => {
      const config = resolveWorkerTelemetryConfig(true);
      const span = createJobSpan("process-order", "order-456", 2, config);

      expect(span).toBeDefined();
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const attributes = spans[0]!.attributes;
      expect(attributes["job.name"]).toBe("process-order");
      expect(attributes["job.id"]).toBe("order-456");
      expect(attributes["job.attempt"]).toBe(2);
    });

    it("uses SpanKind.CONSUMER", () => {
      const config = resolveWorkerTelemetryConfig(true);
      const span = createJobSpan("test-job", "test-123", 1, config);

      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0]!.kind).toBe(SpanKind.CONSUMER);
    });

    it("uses custom service name from config", () => {
      const config = resolveWorkerTelemetryConfig({
        enabled: true,
        serviceName: "my-custom-worker",
      });
      const span = createJobSpan("test-job", "test-123", 1, config);

      expect(span).toBeDefined();
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      // The tracer name should match the service name
      expect(spans[0]!.instrumentationScope.name).toBe("my-custom-worker");
    });
  });

  describe("setSpanOk", () => {
    it("sets span status to OK", () => {
      const config = resolveWorkerTelemetryConfig(true);
      const span = createJobSpan("successful-job", "job-789", 1, config);

      setSpanOk(span);
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0]!.status.code).toBe(SpanStatusCode.OK);
    });

    it("handles undefined span gracefully", () => {
      // Should not throw
      expect(() => setSpanOk(undefined)).not.toThrow();
    });
  });

  describe("endSpanWithError", () => {
    it("sets span status to ERROR", () => {
      const config = resolveWorkerTelemetryConfig(true);
      const span = createJobSpan("failed-job", "job-fail", 1, config);

      endSpanWithError(span, new Error("Job processing failed"));
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0]!.status.code).toBe(SpanStatusCode.ERROR);
    });

    it("records exception on span", () => {
      const config = resolveWorkerTelemetryConfig(true);
      const span = createJobSpan("error-job", "job-err", 1, config);

      const error = new Error("Test error message");
      endSpanWithError(span, error);
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const events = spans[0]!.events;
      expect(events).toHaveLength(1);
      expect(events[0]!.name).toBe("exception");
      expect(events[0]!.attributes?.["exception.message"]).toBe("Test error message");
    });

    it("handles string errors", () => {
      const config = resolveWorkerTelemetryConfig(true);
      const span = createJobSpan("string-error-job", "job-str", 1, config);

      endSpanWithError(span, "String error occurred");
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0]!.status.code).toBe(SpanStatusCode.ERROR);

      const events = spans[0]!.events;
      expect(events).toHaveLength(1);
      expect(events[0]!.name).toBe("exception");
    });

    it("handles undefined span gracefully", () => {
      // Should not throw
      expect(() => endSpanWithError(undefined, new Error("test"))).not.toThrow();
    });
  });

  describe("setJobStatus", () => {
    it("sets job.status attribute to success", () => {
      const config = resolveWorkerTelemetryConfig(true);
      const span = createJobSpan("status-job", "job-status", 1, config);

      setJobStatus(span, "success");
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0]!.attributes["job.status"]).toBe("success");
    });

    it("sets job.status attribute to error", () => {
      const config = resolveWorkerTelemetryConfig(true);
      const span = createJobSpan("status-job-err", "job-status-err", 1, config);

      setJobStatus(span, "error");
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0]!.attributes["job.status"]).toBe("error");
    });

    it("sets job.status attribute to retry", () => {
      const config = resolveWorkerTelemetryConfig(true);
      const span = createJobSpan("status-job-retry", "job-status-retry", 1, config);

      setJobStatus(span, "retry");
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0]!.attributes["job.status"]).toBe("retry");
    });

    it("handles undefined span gracefully", () => {
      // Should not throw
      expect(() => setJobStatus(undefined, "success")).not.toThrow();
    });
  });

  describe("span attributes", () => {
    it("can set additional custom attributes on span", () => {
      const config = resolveWorkerTelemetryConfig(true);
      const span = createJobSpan("custom-attrs-job", "job-custom", 1, config);

      span?.setAttribute("order.id", "ORD-12345");
      span?.setAttribute("order.total", 99.99);
      span?.setAttribute("order.express", true);
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0]!.attributes["order.id"]).toBe("ORD-12345");
      expect(spans[0]!.attributes["order.total"]).toBe(99.99);
      expect(spans[0]!.attributes["order.express"]).toBe(true);
    });

    it("can add events to span", () => {
      const config = resolveWorkerTelemetryConfig(true);
      const span = createJobSpan("events-job", "job-events", 1, config);

      span?.addEvent("processing.started");
      span?.addEvent("processing.step", { step: "validation" });
      span?.addEvent("processing.completed");
      span?.end();

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0]!.events).toHaveLength(3);
      expect(spans[0]!.events[0]!.name).toBe("processing.started");
      expect(spans[0]!.events[1]!.name).toBe("processing.step");
      expect(spans[0]!.events[1]!.attributes?.step).toBe("validation");
      expect(spans[0]!.events[2]!.name).toBe("processing.completed");
    });
  });
});

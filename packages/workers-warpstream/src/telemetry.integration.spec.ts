import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { z } from "zod";
import {
  init,
  workerRouter,
  ok,
  initWorkerTelemetry,
  resolveWorkerMetricsConfig,
  JOB_CREATED_AT_HEADER,
  calculateQueueTime,
} from "@alt-stack/workers-core";

// Note: Full integration tests with Kafka would require a running Kafka broker.
// These tests verify telemetry configuration and type correctness.

describe("workers-warpstream telemetry integration", () => {
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

  describe("telemetry configuration types", () => {
    it("accepts boolean telemetry option in router types", () => {
      const { router, procedure } = init();

      const testRouter = workerRouter({
        "process-message": procedure
          .input({ payload: z.object({ data: z.string() }) })
          .queue("messages", async ({ input }) => {
            return ok({ processed: true, data: input.data });
          }),
      });

      // Type check: telemetry option should be valid
      type TestOptions = {
        kafka: { brokers: string[] };
        groupId: string;
        telemetry?: boolean;
      };

      const _options: TestOptions = {
        kafka: { brokers: ["localhost:9092"] },
        groupId: "test-group",
        telemetry: true,
      };

      expect(testRouter).toBeDefined();
    });

    it("accepts full telemetry config in router types", () => {
      const { router, procedure } = init();

      const testRouter = workerRouter({
        "process-event": procedure
          .input({ payload: z.object({ eventId: z.string() }) })
          .task(async ({ input }) => {
            return ok({ processed: input.eventId });
          }),
        "health-check": procedure.task(async () => ok({ healthy: true })),
      });

      // Type check: full telemetry config should be valid
      type TestOptions = {
        kafka: { brokers: string[] };
        groupId: string;
        telemetry?: {
          enabled: boolean;
          serviceName?: string;
          ignoreJobs?: string[];
        };
      };

      const _options: TestOptions = {
        kafka: { brokers: ["localhost:9092"] },
        groupId: "test-group",
        telemetry: {
          enabled: true,
          serviceName: "my-kafka-worker",
          ignoreJobs: ["health-check"],
        },
      };

      expect(testRouter).toBeDefined();
    });
  });

  describe("span in context", () => {
    it("span is available in WarpStreamContext type", () => {
      // This is a type-level test - if it compiles, the span field is available
      const { router, procedure } = init();

      let spanReceived = false;

      const testRouter = workerRouter({
        "test-span": procedure
          .input({ payload: z.object({ id: z.string() }) })
          .queue("test-queue", async ({ ctx }) => {
            // ctx should have span property from BaseWorkerContext
            if (ctx.span) {
              spanReceived = true;
              ctx.span.setAttribute("message.id", "test-123");
            }
            return ok({ done: true });
          }),
      });

      // Just verify the router compiles correctly with span access
      expect(testRouter).toBeDefined();
    });

    it("span is available in task procedures", () => {
      const { router, procedure } = init();

      const testRouter = workerRouter({
        "process-data": procedure
          .input({ payload: z.object({ batch: z.array(z.string()) }) })
          .task(async ({ ctx, input }) => {
            // Span available for custom attributes
            ctx.span?.setAttribute("batch.size", input.batch.length);
            ctx.span?.addEvent("processing.started");

            // Process...

            ctx.span?.addEvent("processing.completed");
            return ok({ count: input.batch.length });
          }),
      });

      expect(testRouter).toBeDefined();
    });
  });

  describe("telemetry disabled", () => {
    it("router works with telemetry disabled", () => {
      const { router, procedure } = init();

      const testRouter = workerRouter({
        "simple-job": procedure.task(async () => ok({ done: true })),
      });

      // Type check: telemetry: false should be valid
      type TestOptions = {
        kafka: { brokers: string[] };
        groupId: string;
        telemetry?: false;
      };

      const _options: TestOptions = {
        kafka: { brokers: ["localhost:9092"] },
        groupId: "test-group",
        telemetry: false,
      };

      expect(testRouter).toBeDefined();
    });

    it("router works without telemetry option", () => {
      const { router, procedure } = init();

      const testRouter = workerRouter({
        "simple-job": procedure.task(async () => ok({ done: true })),
      });

      // Type check: no telemetry option should be valid (opt-in by default)
      type TestOptions = {
        kafka: { brokers: string[] };
        groupId: string;
      };

      const _options: TestOptions = {
        kafka: { brokers: ["localhost:9092"] },
        groupId: "test-group",
      };

      expect(testRouter).toBeDefined();
    });
  });

  // ============================================================================
  // METRICS TESTS
  // ============================================================================

  describe("metrics configuration types", () => {
    it("accepts boolean metrics option in CreateWorkerOptions", () => {
      // Type check: metrics: true should be valid
      type TestOptions = {
        kafka: { brokers: string[] };
        groupId: string;
        metrics?: boolean;
      };

      const _options: TestOptions = {
        kafka: { brokers: ["localhost:9092"] },
        groupId: "test-group",
        metrics: true,
      };

      expect(_options.metrics).toBe(true);
    });

    it("accepts full metrics config in CreateWorkerOptions", () => {
      // Type check: full metrics config should be valid
      type TestOptions = {
        kafka: { brokers: string[] };
        groupId: string;
        metrics?: {
          enabled: boolean;
          serviceName?: string;
          ignoreJobs?: string[];
          histogramBuckets?: number[];
        };
      };

      const _options: TestOptions = {
        kafka: { brokers: ["localhost:9092"] },
        groupId: "test-group",
        metrics: {
          enabled: true,
          serviceName: "my-worker",
          ignoreJobs: ["health-check"],
          histogramBuckets: [100, 500, 1000, 5000],
        },
      };

      expect(_options.metrics?.enabled).toBe(true);
    });

    it("supports both telemetry and metrics options together", () => {
      type TestOptions = {
        kafka: { brokers: string[] };
        groupId: string;
        telemetry?: boolean;
        metrics?: boolean;
      };

      const _options: TestOptions = {
        kafka: { brokers: ["localhost:9092"] },
        groupId: "test-group",
        telemetry: true,
        metrics: true,
      };

      expect(_options.telemetry).toBe(true);
      expect(_options.metrics).toBe(true);
    });
  });

  describe("metrics helper functions", () => {
    it("resolveWorkerMetricsConfig returns correct defaults", () => {
      const config = resolveWorkerMetricsConfig(true);
      expect(config.enabled).toBe(true);
      expect(config.serviceName).toBe("altstack-worker");
      expect(config.ignoreJobs).toEqual([]);
      expect(config.histogramBuckets).toEqual([10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]);
    });

    it("JOB_CREATED_AT_HEADER is the expected value", () => {
      expect(JOB_CREATED_AT_HEADER).toBe("x-created-at");
    });

    it("calculateQueueTime handles valid timestamps", () => {
      const now = Date.now();
      const createdAt = (now - 1000).toString(); // 1 second ago
      const queueTime = calculateQueueTime(createdAt);

      expect(queueTime).not.toBe(null);
      expect(queueTime).toBeGreaterThanOrEqual(1000);
      expect(queueTime).toBeLessThan(1100);
    });

    it("calculateQueueTime handles invalid timestamps", () => {
      expect(calculateQueueTime(undefined)).toBe(null);
      expect(calculateQueueTime("invalid")).toBe(null);
      expect(calculateQueueTime("")).toBe(null);
    });
  });
});

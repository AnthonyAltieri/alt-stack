/**
 * OpenTelemetry integration for Altstack workers.
 * Provides automatic job tracing with minimal configuration.
 */

// Re-export Span type for users who want type safety without importing @opentelemetry/api
export type { Span, SpanStatusCode } from "@opentelemetry/api";

/** Configuration for worker telemetry */
export interface WorkerTelemetryConfig {
  enabled: boolean;
  /** Custom service name (defaults to "altstack-worker") */
  serviceName?: string;
  /** Job names to skip tracing (e.g., ["health-check"]) */
  ignoreJobs?: string[];
}

/** Telemetry option: boolean shorthand or full config */
export type WorkerTelemetryOption = boolean | WorkerTelemetryConfig;

/** Normalized config after processing boolean shorthand */
export interface ResolvedWorkerTelemetryConfig {
  enabled: boolean;
  serviceName: string;
  ignoreJobs: string[];
}

/** Normalize WorkerTelemetryOption to full config */
export function resolveWorkerTelemetryConfig(
  option: WorkerTelemetryOption | undefined,
): ResolvedWorkerTelemetryConfig {
  if (option === undefined || option === false) {
    return { enabled: false, serviceName: "altstack-worker", ignoreJobs: [] };
  }
  if (option === true) {
    return { enabled: true, serviceName: "altstack-worker", ignoreJobs: [] };
  }
  return {
    enabled: option.enabled,
    serviceName: option.serviceName ?? "altstack-worker",
    ignoreJobs: option.ignoreJobs ?? [],
  };
}

/** Check if a job should be ignored for tracing */
export function shouldIgnoreJob(
  jobName: string,
  config: ResolvedWorkerTelemetryConfig,
): boolean {
  return config.ignoreJobs.includes(jobName);
}

// Lazy-loaded OpenTelemetry API
let otelApi: typeof import("@opentelemetry/api") | null = null;
let otelLoaded = false;

async function getOtelApi(): Promise<typeof import("@opentelemetry/api") | null> {
  if (otelLoaded) return otelApi;
  otelLoaded = true;
  try {
    otelApi = await import("@opentelemetry/api");
  } catch {
    // @opentelemetry/api not installed - telemetry disabled
    otelApi = null;
  }
  return otelApi;
}

// Synchronous check after initial load
function getOtelApiSync(): typeof import("@opentelemetry/api") | null {
  return otelApi;
}

/** Initialize telemetry (call once at startup) */
export async function initWorkerTelemetry(): Promise<boolean> {
  const api = await getOtelApi();
  return api !== null;
}

/** Create a job span for worker operations - uses SpanKind.CONSUMER */
export function createJobSpan(
  jobName: string,
  jobId: string,
  attempt: number,
  config: ResolvedWorkerTelemetryConfig,
): import("@opentelemetry/api").Span | undefined {
  const api = getOtelApiSync();
  if (!api) return undefined;

  const tracer = api.trace.getTracer(config.serviceName);
  const span = tracer.startSpan(`job ${jobName}`, {
    kind: api.SpanKind.CONSUMER,
    attributes: {
      "job.name": jobName,
      "job.id": jobId,
      "job.attempt": attempt,
    },
  });

  return span;
}

/** End a span with error status */
export function endSpanWithError(
  span: import("@opentelemetry/api").Span | undefined,
  error: unknown,
): void {
  if (!span) return;

  const api = getOtelApiSync();
  if (!api) return;

  span.setStatus({ code: api.SpanStatusCode.ERROR });
  if (error instanceof Error) {
    span.recordException(error);
  } else {
    span.recordException(String(error));
  }
}

/** Set span status to OK */
export function setSpanOk(span: import("@opentelemetry/api").Span | undefined): void {
  if (!span) return;
  const api = getOtelApiSync();
  if (!api) return;
  span.setStatus({ code: api.SpanStatusCode.OK });
}

/** Set job status attribute on span */
export function setJobStatus(
  span: import("@opentelemetry/api").Span | undefined,
  status: "success" | "error" | "retry",
): void {
  if (!span) return;
  span.setAttribute("job.status", status);
}

// ============================================================================
// METRICS API
// ============================================================================

/** Header name for job creation timestamp */
export const JOB_CREATED_AT_HEADER = "x-created-at";

/** Configuration for worker metrics */
export interface WorkerMetricsConfig {
  enabled: boolean;
  /** Custom service name (defaults to "altstack-worker") */
  serviceName?: string;
  /** Job names to skip metrics (e.g., ["health-check"]) */
  ignoreJobs?: string[];
  /** Custom histogram bucket boundaries in milliseconds */
  histogramBuckets?: number[];
}

/** Metrics option: boolean shorthand or full config */
export type WorkerMetricsOption = boolean | WorkerMetricsConfig;

/** Default histogram buckets (ms): 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000 */
const DEFAULT_HISTOGRAM_BUCKETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/** Normalized config after processing boolean shorthand */
export interface ResolvedWorkerMetricsConfig {
  enabled: boolean;
  serviceName: string;
  ignoreJobs: string[];
  histogramBuckets: number[];
}

/** Normalize WorkerMetricsOption to full config */
export function resolveWorkerMetricsConfig(
  option: WorkerMetricsOption | undefined,
): ResolvedWorkerMetricsConfig {
  if (option === undefined || option === false) {
    return {
      enabled: false,
      serviceName: "altstack-worker",
      ignoreJobs: [],
      histogramBuckets: DEFAULT_HISTOGRAM_BUCKETS,
    };
  }
  if (option === true) {
    return {
      enabled: true,
      serviceName: "altstack-worker",
      ignoreJobs: [],
      histogramBuckets: DEFAULT_HISTOGRAM_BUCKETS,
    };
  }
  return {
    enabled: option.enabled,
    serviceName: option.serviceName ?? "altstack-worker",
    ignoreJobs: option.ignoreJobs ?? [],
    histogramBuckets: option.histogramBuckets ?? DEFAULT_HISTOGRAM_BUCKETS,
  };
}

/** Check if a job should be ignored for metrics */
export function shouldIgnoreJobMetrics(
  jobName: string,
  config: ResolvedWorkerMetricsConfig,
): boolean {
  return config.ignoreJobs.includes(jobName);
}

// Metrics instruments (initialized lazily)
let metricsInitialized = false;
let queueTimeHistogram: import("@opentelemetry/api").Histogram | null = null;
let processingTimeHistogram: import("@opentelemetry/api").Histogram | null = null;
let e2eTimeHistogram: import("@opentelemetry/api").Histogram | null = null;

/** Initialize metrics (call once at startup with config) */
export async function initWorkerMetrics(
  config: ResolvedWorkerMetricsConfig,
): Promise<boolean> {
  if (metricsInitialized) return queueTimeHistogram !== null;

  metricsInitialized = true;

  const api = await getOtelApi();
  if (!api || !api.metrics) return false;

  try {
    const meter = api.metrics.getMeter(config.serviceName);

    queueTimeHistogram = meter.createHistogram("messaging.process.queue_time", {
      description: "Time from job creation to processing start",
      unit: "ms",
      advice: { explicitBucketBoundaries: config.histogramBuckets },
    });

    processingTimeHistogram = meter.createHistogram("messaging.process.duration", {
      description: "Job handler execution duration",
      unit: "ms",
      advice: { explicitBucketBoundaries: config.histogramBuckets },
    });

    e2eTimeHistogram = meter.createHistogram("messaging.process.e2e_time", {
      description: "End-to-end time from job creation to completion",
      unit: "ms",
      advice: { explicitBucketBoundaries: config.histogramBuckets },
    });

    return true;
  } catch {
    // Metrics API not available
    return false;
  }
}

/** Record queue time metric */
export function recordQueueTime(jobName: string, queueTimeMs: number): void {
  queueTimeHistogram?.record(queueTimeMs, { "job.name": jobName });
}

/** Record processing time metric */
export function recordProcessingTime(
  jobName: string,
  processingTimeMs: number,
  status: "success" | "error",
): void {
  processingTimeHistogram?.record(processingTimeMs, {
    "job.name": jobName,
    "job.status": status,
  });
}

/** Record end-to-end time metric */
export function recordE2ETime(
  jobName: string,
  e2eTimeMs: number,
  status: "success" | "error",
): void {
  e2eTimeHistogram?.record(e2eTimeMs, {
    "job.name": jobName,
    "job.status": status,
  });
}

/** Calculate queue time from creation timestamp header */
export function calculateQueueTime(createdAtHeader: string | undefined): number | null {
  if (!createdAtHeader) return null;

  const createdAt = parseInt(createdAtHeader, 10);
  if (isNaN(createdAt) || createdAt <= 0) return null;

  const queueTime = Date.now() - createdAt;
  // Sanity check: ignore negative or unreasonably large values (> 7 days)
  if (queueTime < 0 || queueTime > 604800000) return null;

  return queueTime;
}

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

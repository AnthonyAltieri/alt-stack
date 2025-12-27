/**
 * OpenTelemetry integration for Altstack servers.
 * Provides automatic request tracing with minimal configuration.
 */

// Re-export Span type for users who want type safety without importing @opentelemetry/api
export type { Span, SpanStatusCode } from "@opentelemetry/api";

/** Configuration for telemetry */
export interface TelemetryConfig {
  enabled: boolean;
  /** Custom service name (defaults to "altstack-server") */
  serviceName?: string;
  /** Routes to skip tracing (e.g., ["/health", "/metrics"]) */
  ignoreRoutes?: string[];
}

/** Telemetry option: boolean shorthand or full config */
export type TelemetryOption = boolean | TelemetryConfig;

/** Normalized config after processing boolean shorthand */
export interface ResolvedTelemetryConfig {
  enabled: boolean;
  serviceName: string;
  ignoreRoutes: string[];
}

/** Normalize TelemetryOption to full config */
export function resolveTelemetryConfig(
  option: TelemetryOption | undefined,
): ResolvedTelemetryConfig {
  if (option === undefined || option === false) {
    return { enabled: false, serviceName: "altstack-server", ignoreRoutes: [] };
  }
  if (option === true) {
    return { enabled: true, serviceName: "altstack-server", ignoreRoutes: [] };
  }
  return {
    enabled: option.enabled,
    serviceName: option.serviceName ?? "altstack-server",
    ignoreRoutes: option.ignoreRoutes ?? [],
  };
}

/** Check if a route should be ignored for tracing */
export function shouldIgnoreRoute(
  path: string,
  config: ResolvedTelemetryConfig,
): boolean {
  return config.ignoreRoutes.some(
    (ignored) => path === ignored || path.startsWith(ignored + "/"),
  );
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
export async function initTelemetry(): Promise<boolean> {
  const api = await getOtelApi();
  return api !== null;
}

/** Span interface matching @opentelemetry/api Span */
interface SpanLike {
  setAttribute(key: string, value: string | number | boolean): this;
  setStatus(status: { code: number; message?: string }): this;
  recordException(exception: Error | string): void;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): this;
  end(): void;
}

/** Create a request span for HTTP server operations */
export function createRequestSpan(
  method: string,
  route: string,
  urlPath: string,
  config: ResolvedTelemetryConfig,
): SpanLike | undefined {
  const api = getOtelApiSync();
  if (!api) return undefined;

  const tracer = api.trace.getTracer(config.serviceName);
  const span = tracer.startSpan(`${method} ${route}`, {
    kind: api.SpanKind.SERVER,
    attributes: {
      "http.request.method": method,
      "http.route": route,
      "url.path": urlPath,
    },
  });

  return span;
}

/** End a span with error status */
export function endSpanWithError(
  span: SpanLike | undefined,
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
export function setSpanOk(span: SpanLike | undefined): void {
  if (!span) return;
  const api = getOtelApiSync();
  if (!api) return;
  span.setStatus({ code: api.SpanStatusCode.OK });
}

/**
 * Execute a function with a span set as the active context.
 * This enables automatic parent-child span relationships for instrumented libraries
 * (e.g., MongoDB, HTTP clients) that create spans during the function execution.
 */
export function withActiveSpan<T>(
  span: SpanLike | undefined,
  fn: () => T,
): T {
  const api = getOtelApiSync();
  if (!api || !span) return fn();

  return api.context.with(
    api.trace.setSpan(api.context.active(), span as import("@opentelemetry/api").Span),
    fn,
  );
}


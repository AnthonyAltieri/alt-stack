# OpenTelemetry Integration

Distributed tracing and timing metrics for WarpStream workers using [OpenTelemetry](https://opentelemetry.io/).

## Installation

```bash
pnpm add @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```

## Tracing

### Quick Start

```typescript
import { createWorker } from "@alt-stack/workers-warpstream";
import { jobRouter } from "./jobs";

const worker = await createWorker(jobRouter, {
  kafka: { brokers: ["warpstream.example.com:9092"] },
  groupId: "my-workers",
  telemetry: true,
});
```

### Configuration

```typescript
const worker = await createWorker(jobRouter, {
  kafka: { brokers: ["..."] },
  groupId: "my-workers",
  telemetry: {
    enabled: true,
    serviceName: "email-worker",
    ignoreJobs: ["health-check", "metrics-poll"],
  },
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable/disable tracing |
| `serviceName` | `string` | `"altstack-worker"` | Service name for traces |
| `ignoreJobs` | `string[]` | `[]` | Job names to exclude from tracing |

### Span Attributes

Each job creates a span with these attributes:

| Attribute | Example | Description |
|-----------|---------|-------------|
| `job.name` | `send-welcome-email` | Job name from router |
| `job.id` | `topic-0-12345` | Unique job identifier |
| `job.attempt` | `1` | Attempt number |
| `job.status` | `success` | Final status (success/error/retry) |

### Custom Attributes

Access the span via `ctx.span`:

```typescript
"process-order": procedure
  .input({ payload: z.object({ orderId: z.string() }) })
  .task(async ({ input, ctx }) => {
    ctx.span?.setAttribute("order.id", input.orderId);
    ctx.span?.addEvent("order.validated");

    // Process order...

    ctx.span?.addEvent("order.completed");
    return ok({ processed: true });
  }),
```

## Metrics

### Quick Start

```typescript
const worker = await createWorker(jobRouter, {
  kafka: { brokers: ["warpstream.example.com:9092"] },
  groupId: "my-workers",
  metrics: true,
});
```

### Configuration

```typescript
const worker = await createWorker(jobRouter, {
  kafka: { brokers: ["..."] },
  groupId: "my-workers",
  metrics: {
    enabled: true,
    serviceName: "email-worker",
    ignoreJobs: ["health-check"],
    histogramBuckets: [10, 50, 100, 500, 1000, 5000],
  },
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable/disable metrics |
| `serviceName` | `string` | `"altstack-worker"` | Meter name |
| `ignoreJobs` | `string[]` | `[]` | Job names to exclude from metrics |
| `histogramBuckets` | `number[]` | `[10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]` | Histogram bucket boundaries (ms) |

### Metrics Recorded

| Metric | Type | Description |
|--------|------|-------------|
| `messaging.process.queue_time_ms` | Histogram | Time from job creation to processing start (ms) |
| `messaging.process.duration_ms` | Histogram | Job handler execution duration (ms) |
| `messaging.process.e2e_time_ms` | Histogram | End-to-end time from creation to completion (ms) |

All metrics include these attributes:
- `job.name`: The job name
- `job.status`: `"success"` or `"error"` (for duration and e2e_time)

### How Queue Time Works

Queue time is measured using the `x-created-at` header automatically added by job clients. Both `createJobClient` and `createWarpStreamClient` add this header when enqueuing jobs.

If you're using a custom producer, add the header manually:

```typescript
const message = {
  value: JSON.stringify(payload),
  headers: {
    "x-created-at": Date.now().toString(),
  },
};
```

## Using Both Tracing and Metrics

Enable both for comprehensive observability:

```typescript
const worker = await createWorker(jobRouter, {
  kafka: { brokers: ["warpstream.example.com:9092"] },
  groupId: "my-workers",
  telemetry: true,  // Spans
  metrics: true,    // Histograms
});
```

## OTel SDK Setup

Create `tracing.ts` and import it **first** in your entry point:

```typescript
// tracing.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: "http://localhost:4318/v1/traces",
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: "http://localhost:4318/v1/metrics",
    }),
  }),
});

sdk.start();

process.on("SIGTERM", () => sdk.shutdown().then(() => process.exit(0)));
```

```typescript
// index.ts
import "./tracing.js"; // Must be first!
import { createWorker } from "@alt-stack/workers-warpstream";
```

## Local Development with Jaeger

```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

View traces at http://localhost:16686

## Graceful Degradation

If `@opentelemetry/api` is not installed, telemetry is silently disabled. `ctx.span` will be `undefined`, so always use optional chaining:

```typescript
ctx.span?.setAttribute("key", "value");  // Safe even without OTel
ctx.span?.addEvent("processing.started"); // No-op if undefined
```

Metrics recording functions are also safe to call - they become no-ops if the OTel API is not available.

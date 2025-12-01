# OpenTelemetry Integration

Altstack servers support [OpenTelemetry](https://opentelemetry.io/) for distributed tracing with minimal configuration. When enabled, every request is automatically traced with semantic HTTP attributes.

## Installation

First, install the OpenTelemetry packages:

```bash
pnpm add @opentelemetry/api @opentelemetry/sdk-trace-node @opentelemetry/exporter-trace-otlp-http
```

## Quick Start

Enable telemetry by passing `telemetry: true` to `createServer`:

```typescript
import { createServer, router, init } from "@alt-stack/server-hono";

const { procedure } = init<AppContext>();

const appRouter = router({
  "/todos": procedure
    .output(z.array(TodoSchema))
    .get(async () => {
      return await db.todos.findMany();
    }),
});

const app = createServer({ api: appRouter }, {
  createContext,
  telemetry: true, // Enable OpenTelemetry
});
```

## Configuration Options

For more control, pass a configuration object:

```typescript
const app = createServer({ api: appRouter }, {
  createContext,
  telemetry: {
    enabled: true,
    serviceName: "my-api",           // Custom service name (default: "altstack-server")
    ignoreRoutes: ["/health", "/metrics"], // Routes to skip tracing
  },
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable/disable telemetry |
| `serviceName` | `string` | `"altstack-server"` | Service name for traces |
| `ignoreRoutes` | `string[]` | `[]` | Routes to exclude from tracing |

## Span Attributes

Each request span includes these attributes following [OpenTelemetry HTTP semantic conventions](https://opentelemetry.io/docs/specs/semconv/http/http-spans/):

| Attribute | Example | Description |
|-----------|---------|-------------|
| `http.request.method` | `GET` | HTTP method |
| `http.route` | `/api/todos/{id}` | Route pattern (with path params) |
| `url.path` | `/api/todos/123` | Actual URL path |
| `http.response.status_code` | `200` | Response status code |

## Custom Spans and Attributes

Access the current span via `ctx.span` to add custom attributes or events:

```typescript
const todoRouter = router({
  "/todos/{id}": procedure
    .input({ params: z.object({ id: z.string() }) })
    .get(async ({ input, ctx }) => {
      // Add custom attributes
      ctx.span?.setAttribute("todo.id", input.params.id);
      
      // Add events for significant operations
      ctx.span?.addEvent("db-query-start");
      const todo = await db.todos.findUnique({ 
        where: { id: input.params.id } 
      });
      ctx.span?.addEvent("db-query-end");
      
      return todo;
    }),
});
```

## Setting Up the OTel SDK

Before your server starts, initialize the OpenTelemetry SDK. Here's a typical setup:

```typescript
// tracing.ts - import this before your server starts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: "my-api",
  }),
  traceExporter: new OTLPTraceExporter({
    url: "http://localhost:4318/v1/traces", // OTLP HTTP endpoint
  }),
});

sdk.start();

// Graceful shutdown
process.on("SIGTERM", () => {
  sdk.shutdown().then(() => process.exit(0));
});
```

Then import this file at the top of your main entry point:

```typescript
// index.ts
import "./tracing.js"; // Must be first!
import { createServer } from "@alt-stack/server-hono";
// ... rest of your server code
```

## Example with Jaeger

To visualize traces locally with [Jaeger](https://www.jaegertracing.io/):

1. Run Jaeger with Docker:

```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

2. Configure the OTLP exporter to send to Jaeger:

```typescript
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: "http://localhost:4318/v1/traces",
  }),
});
```

3. View traces at http://localhost:16686

## Works with Both Adapters

Telemetry works identically with both Hono and Express adapters:

```typescript
// Hono
import { createServer } from "@alt-stack/server-hono";
const app = createServer({ api: router }, { telemetry: true });

// Express
import { createServer } from "@alt-stack/server-express";
const app = createServer({ api: router }, { telemetry: true });
```

## Graceful Degradation

If `@opentelemetry/api` is not installed, telemetry is silently disabled. This allows you to:

- Use the same code in development (without OTel) and production (with OTel)
- Keep `@opentelemetry/api` as a dev dependency in some environments

The `ctx.span` will be `undefined` when telemetry is disabled or not installed, so always use optional chaining:

```typescript
ctx.span?.setAttribute("key", "value"); // Safe even without OTel
```


# OpenTelemetry Integration

Automatic distributed tracing for Altstack servers with [OpenTelemetry](https://opentelemetry.io/).

## Installation

```bash
pnpm add @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```

## Quick Start

```typescript
import { createServer, router, init, ok } from "@alt-stack/server-hono";

const { procedure } = init<AppContext>();

const app = createServer({
  "/api": router({
    "/todos": procedure
      .output(z.array(TodoSchema))
      .get(async () => ok(await db.todos.findMany())),
  }),
}, { telemetry: true });
```

## Configuration

```typescript
createServer({ "/api": appRouter }, {
  telemetry: {
    enabled: true,
    serviceName: "my-api",
    ignoreRoutes: ["/health", "/metrics"],
  },
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable/disable telemetry |
| `serviceName` | `string` | `"altstack-server"` | Service name for traces |
| `ignoreRoutes` | `string[]` | `[]` | Routes to exclude from tracing |

## Span Attributes

Follows [OpenTelemetry HTTP semantic conventions](https://opentelemetry.io/docs/specs/semconv/http/http-spans/):

| Attribute | Example | Description |
|-----------|---------|-------------|
| `http.request.method` | `GET` | HTTP method |
| `http.route` | `/api/todos/{id}` | Route pattern |
| `url.path` | `/api/todos/123` | Actual URL path |
| `http.response.status_code` | `200` | Response status |

## Custom Attributes

Access the span via `ctx.span`:

```typescript
"/todos/{id}": procedure
  .input({ params: z.object({ id: z.string() }) })
  .get(async ({ input, ctx }) => {
    ctx.span?.setAttribute("todo.id", input.params.id);
    ctx.span?.addEvent("db-query");
    const todo = await db.todos.findUnique({ where: { id: input.params.id } });
    return ok(todo);
  }),
```

## OTel SDK Setup

Create `tracing.ts` and import it **first** in your entry point:

```typescript
// tracing.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: "http://localhost:4318/v1/traces",
  }),
});
sdk.start();

process.on("SIGTERM", () => sdk.shutdown().then(() => process.exit(0)));
```

```typescript
// index.ts
import "./tracing.js"; // Must be first!
import { createServer } from "@alt-stack/server-hono";
```

## Local Tracing with Jaeger

```bash
docker run -d --name jaeger -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one:latest
```

View traces at http://localhost:16686

## Works with Both Adapters

```typescript
// Hono
import { createServer } from "@alt-stack/server-hono";
const app = createServer({ "/api": appRouter }, { telemetry: true });

// Express
import { createServer } from "@alt-stack/server-express";
const app = createServer({ "/api": appRouter }, { telemetry: true });
```

## Graceful Degradation

If `@opentelemetry/api` is not installed, telemetry is silently disabled. `ctx.span` will be `undefined`, so use optional chaining:

```typescript
ctx.span?.setAttribute("key", "value"); // Safe even without OTel
```

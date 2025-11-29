# @alt-stack/workers-client-trigger

Trigger.dev client for type-safe worker triggering. Works with SDKs generated from AsyncAPI specs.

## Installation

```bash
pnpm add @alt-stack/workers-client-trigger @trigger.dev/sdk zod
```

## Usage

### Generate SDK from Worker Router

First, generate an AsyncAPI spec from your worker router:

```typescript
// generate-spec.ts
import { generateAsyncAPISpec } from "@alt-stack/workers-core";
import { appRouter } from "./routers";
import { writeFileSync } from "node:fs";

const spec = generateAsyncAPISpec(appRouter, {
  title: "Workers API",
  version: "1.0.0",
});

writeFileSync("asyncapi.json", JSON.stringify(spec, null, 2));
```

Then generate TypeScript types:

```bash
npx asyncapi-to-zod asyncapi.json -o ./sdk/index.ts
```

### Trigger Workers

```typescript
import { Topics } from "./sdk";
import { createTriggerClient } from "@alt-stack/workers-client-trigger";

const client = createTriggerClient({ jobs: Topics });

// Type-safe: only valid job names and payloads allowed
await client.trigger("send-welcome-email", {
  userId: "123",
  email: "user@example.com",
});

// Batch triggering
await client.triggerBatch("process-image", [
  { imageUrl: "https://example.com/1.jpg" },
  { imageUrl: "https://example.com/2.jpg" },
]);
```

### Options

```typescript
const client = createTriggerClient({
  jobs: Topics,
  onError: (error) => console.error("Trigger error:", error),
});

await client.trigger("send-email", payload, {
  idempotencyKey: "unique-key-123",
  delay: "PT5M", // 5 minutes delay (ISO 8601 duration)
});
```

## API

### `createTriggerClient(options)`

Creates a type-safe Trigger.dev client.

Options:
- `jobs` - Jobs map from generated SDK (required)
- `onError` - Error callback (optional)

Returns a `WorkerClient` instance.


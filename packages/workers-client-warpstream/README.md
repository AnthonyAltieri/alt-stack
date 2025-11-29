# @alt-stack/workers-client-warpstream

WarpStream/Kafka client for type-safe worker triggering. Works with SDKs generated from AsyncAPI specs.

## Installation

```bash
pnpm add @alt-stack/workers-client-warpstream kafkajs zod
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
import { createWarpStreamClient } from "@alt-stack/workers-client-warpstream";

const client = await createWarpStreamClient({
  bootstrapServer: "my-cluster.warpstream.com:9092",
  jobs: Topics,
});

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

await client.disconnect();
```

### Options

```typescript
const client = await createWarpStreamClient({
  bootstrapServer: "my-cluster.warpstream.com:9092",
  jobs: Topics,
  topicPrefix: "prod-",  // Topics become "prod-send-welcome-email", etc.
  clientId: "my-producer",
  onError: (error) => console.error("Error:", error),
});
```

## WarpStream Optimizations

This client uses WarpStream-recommended defaults:
- LZ4 compression for better throughput
- Extended connection timeout (10s)
- Extended metadata max age (60s)

## API

### `createWarpStreamClient(options)`

Creates a type-safe WarpStream client.

Options:
- `bootstrapServer` - WarpStream server URL (required)
- `jobs` - Jobs map from generated SDK (required)
- `topicPrefix` - Prefix for topic names (optional, default: "")
- `clientId` - Kafka client ID (optional)
- `producerConfig` - Override producer settings (optional)
- `onError` - Error callback (optional)

Returns a `Promise<WorkerClient>` instance.


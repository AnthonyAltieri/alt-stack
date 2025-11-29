# SDK Generation

Generate a type-safe SDK from your worker definitions to trigger jobs without importing router code.

## Overview

The SDK generation workflow:

1. Define workers with `workerRouter`
2. Generate AsyncAPI spec from the router
3. Generate TypeScript SDK from the spec
4. Use the SDK with worker clients

This allows services to trigger workers without depending on the worker implementation code.

## Generate AsyncAPI Spec

```typescript
// generate-spec.ts
import { generateAsyncAPISpec } from "@alt-stack/workers-core";
import { appRouter } from "./routers";
import { writeFileSync } from "node:fs";

const spec = generateAsyncAPISpec(appRouter, {
  title: "Workers API",
  version: "1.0.0",
  description: "Background job definitions",
});

writeFileSync("asyncapi.json", JSON.stringify(spec, null, 2));
console.log("Generated asyncapi.json");
```

Run it:

```bash
npx tsx generate-spec.ts
```

:::note
Only `task` and `queue` procedures are included in the spec. Cron jobs are excluded since they don't accept external payloads.
:::

## Generate TypeScript SDK

Use the `asyncapi-to-zod` CLI to generate Zod schemas:

```bash
npx asyncapi-to-zod asyncapi.json -o ./sdk/index.ts
```

This generates:

```typescript
// sdk/index.ts (auto-generated)
import { z } from 'zod';

export const SendWelcomeEmailPayloadSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
});
export type SendWelcomeEmailPayload = z.infer<typeof SendWelcomeEmailPayloadSchema>;

export const ProcessImagePayloadSchema = z.object({
  imageUrl: z.string().url(),
});
export type ProcessImagePayload = z.infer<typeof ProcessImagePayloadSchema>;

export const Topics = {
  'send-welcome-email': SendWelcomeEmailPayloadSchema,
  'process-image': ProcessImagePayloadSchema,
} as const;

export type TopicName = keyof typeof Topics;
export type MessageType<T extends TopicName> = z.infer<typeof Topics[T]>;
```

## Use with Worker Clients

### Trigger.dev Client

```typescript
import { Topics } from "@myorg/workers-sdk";
import { createTriggerClient } from "@alt-stack/workers-client-trigger";

const client = createTriggerClient({ jobs: Topics });

// Type-safe: autocomplete for job names and payloads
await client.trigger("send-welcome-email", {
  userId: "user-123",
  email: "user@example.com",
});

// With options
await client.trigger("send-welcome-email", payload, {
  idempotencyKey: "unique-123",
  delay: "PT5M", // 5 minute delay
});
```

### WarpStream Client

```typescript
import { Topics } from "@myorg/workers-sdk";
import { createWarpStreamClient } from "@alt-stack/workers-client-warpstream";

const client = await createWarpStreamClient({
  bootstrapServer: "cluster.warpstream.com:9092",
  jobs: Topics,
});

await client.trigger("send-welcome-email", {
  userId: "user-123",
  email: "user@example.com",
});

await client.disconnect();
```

## Batch Triggering

Trigger multiple jobs efficiently:

```typescript
await client.triggerBatch("process-image", [
  { imageUrl: "https://example.com/1.jpg" },
  { imageUrl: "https://example.com/2.jpg" },
  { imageUrl: "https://example.com/3.jpg" },
]);
```

## Publishing the SDK

Create a package for your SDK:

```json
{
  "name": "@myorg/workers-sdk",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "peerDependencies": {
    "zod": "^3.25.0 || ^4.0.0"
  }
}
```

Add a build script:

```json
{
  "scripts": {
    "generate": "tsx generate-spec.ts && asyncapi-to-zod asyncapi.json -o src/index.ts",
    "build": "tsup src/index.ts --format esm,cjs --dts"
  }
}
```

Other services can then install and use your SDK:

```bash
pnpm add @myorg/workers-sdk @alt-stack/workers-client-trigger
```

## Benefits

- **Decoupled**: Services don't need to import worker router code
- **Type-safe**: Full TypeScript support with autocomplete
- **Validated**: Payloads are validated before sending
- **Versioned**: SDK can be versioned independently


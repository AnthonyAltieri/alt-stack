# `@alt-stack/workers-client-warpstream`

Caller-side KafkaJS/WarpStream client typed and validated by a generated Zod job map. It publishes one topic per job and does not execute handlers.

## Requirements

- KafkaJS 2.x
- Zod 3.25+ or Zod 4
- pre-provisioned job topics

```bash
pnpm add @alt-stack/workers-client-warpstream kafkajs zod
```

## Usage

```typescript
import { createWarpStreamClient } from "@alt-stack/workers-client-warpstream";
import { Topics } from "./generated-jobs.js";

const client = await createWarpStreamClient({
  bootstrapServer: "localhost:9092",
  clientId: "api-jobs",
  topicPrefix: "jobs.",
  jobs: Topics,
});

const run = await client.trigger("resize", { imageId: "img_123" });
console.info(run.id);

await client.disconnect();
```

The topic is the direct concatenation of prefix and job name. The client maps `idempotencyKey` to the Kafka key and `metadata` to headers, stamps `x-created-at`, and ignores `delay`/`maxRetries`. Returned IDs are local identifiers, not Kafka offsets or worker-run IDs.

This generated client supports topic-per-job only. Use `@alt-stack/workers-warpstream#createJobClient` with a live router for single-queue envelopes or full KafkaJS configuration.

## Documentation

- [Worker client contract](../../apps/docs/docs/workers/api/client-core.md)
- [WarpStream client API](../../apps/docs/docs/workers/api/client-warpstream.md)

## License

MIT


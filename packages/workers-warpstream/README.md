# `@alt-stack/workers-warpstream`

KafkaJS/WarpStream server and router-aware producer adapters for `@alt-stack/workers-core`.

- `createWorker(router, options)` runs job procedures from Kafka messages.
- `createJobClient(router, options)` validates and enqueues jobs using the live router.
- every `workers-core` export is re-exported.

## Requirements

- Node.js 18+
- KafkaJS 2.x
- Zod 3.25+ or Zod 4
- a reachable Kafka-compatible broker and provisioned job topics

```bash
pnpm add @alt-stack/workers-warpstream kafkajs zod
```

## Worker and client

```typescript
import {
  createJobClient,
  createWorker,
  init,
  ok,
} from "@alt-stack/workers-warpstream";
import { z } from "zod";

const { router, procedure } = init();

const jobs = router({
  resize: procedure
    .input({ payload: z.object({ imageId: z.string() }) })
    .task(async ({ input }) => {
      console.info(input.imageId);
      return ok();
    }),
});

const routing = { type: "topic-per-job", topicPrefix: "jobs." } as const;

const worker = await createWorker(jobs, {
  kafka: { brokers: ["localhost:9092"] },
  groupId: "image-workers-v1",
  routing,
});

const client = await createJobClient(jobs, {
  kafka: { brokers: ["localhost:9092"] },
  routing,
});

await client.enqueue("resize", { imageId: "img_123" });
```

Pass the same routing to both sides. Topic-per-job concatenates prefix and job name directly. Single-queue routing publishes `{ jobName, payload }` envelopes to one topic.

The adapter does not schedule `.cron()` procedures and does not route by `.queue(name)`; all registered procedures are consumed by job-name routing. Returned `Err` values are normal handler returns, so throw to fail processing.

```typescript
await client.disconnect();
await worker.disconnect();
```

## Documentation

- [Common patterns](../../apps/docs/docs/workers/common-patterns.md)
- [Complete WarpStream API](../../apps/docs/docs/workers/api/warpstream.md)
- [Core API re-exported by this package](../../apps/docs/docs/workers/api/core.md)

## License

MIT

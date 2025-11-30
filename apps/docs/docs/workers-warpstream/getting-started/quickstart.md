# Quickstart

Build async job queues using WarpStream/Kafka with type-safe producers and consumers.

## Define Jobs

```typescript
import { init } from "@alt-stack/workers-warpstream";
import { z } from "zod";

const { router, procedure } = init();

const jobRouter = router({
  "send-email": procedure
    .input({
      payload: z.object({
        to: z.string().email(),
        subject: z.string(),
        body: z.string(),
      }),
    })
    .task(async ({ input, ctx }) => {
      console.log(`Sending email to ${input.to}`);
      // Send email logic here
    }),

  "process-image": procedure
    .input({
      payload: z.object({
        imageUrl: z.string().url(),
        operations: z.array(z.enum(["resize", "crop", "compress"])),
      }),
    })
    .task(async ({ input }) => {
      console.log(`Processing image: ${input.imageUrl}`);
    }),
});

export { jobRouter };
```

## Start Worker

```typescript
import { createWorker } from "@alt-stack/workers-warpstream";
import { jobRouter } from "./jobs";

async function main() {
  const worker = await createWorker(jobRouter, {
    kafka: { brokers: ["warpstream.example.com:9092"] },
    groupId: "job-workers",
  });

  console.log("Worker running, waiting for jobs...");

  // Graceful shutdown
  process.on("SIGINT", async () => {
    await worker.disconnect();
    process.exit(0);
  });

  // Block until shutdown
  await new Promise(() => {});
}

main();
```

## Enqueue Jobs

```typescript
import { createJobClient } from "@alt-stack/workers-warpstream";
import { jobRouter } from "./jobs";

const client = await createJobClient(jobRouter, {
  kafka: { brokers: ["warpstream.example.com:9092"] },
});

// Type-safe: only valid job names and payloads allowed
await client.enqueue("send-email", {
  to: "user@example.com",
  subject: "Welcome!",
  body: "Thanks for signing up.",
});

await client.enqueue("process-image", {
  imageUrl: "https://example.com/image.jpg",
  operations: ["resize", "compress"],
});
```



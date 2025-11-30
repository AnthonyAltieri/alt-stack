# Workers

Background job processing using WarpStream (Kafka-compatible).

## Job Definitions

```typescript title="apps/workers/src/index.ts"
import { createWorker, init, workerRouter } from "@alt-stack/workers-warpstream";
import { z } from "zod";

const { procedure } = init();

export const jobRouter = workerRouter({
  "send-notification": procedure
    .input({
      payload: z.object({
        type: z.enum(["task_created", "task_completed", "task_assigned"]),
        userId: z.string(),
        taskId: z.string(),
        taskTitle: z.string(),
      }),
    })
    .task(async ({ input }) => {
      console.log(`[Notification] ${input.type} for user ${input.userId}`);
      // Send email, push notification, etc.
    }),

  "generate-report": procedure
    .input({
      payload: z.object({
        taskId: z.string(),
        userId: z.string(),
        completedAt: z.string().datetime(),
      }),
    })
    .task(async ({ input }) => {
      console.log(`[Report] Generating report for task ${input.taskId}`);
      // Generate PDF, store in S3, etc.
    }),
});
```

## Starting the Worker

```typescript
const worker = await createWorker(jobRouter, {
  kafka: { brokers: [WARPSTREAM_URL] },
  groupId: GROUP_ID,
});

console.log("Workers running, waiting for jobs...");

// Graceful shutdown
process.on("SIGINT", async () => {
  await worker.disconnect();
  process.exit(0);
});

await new Promise(() => {});
```

## Generating the AsyncAPI Spec

```typescript title="apps/workers/src/generate-spec.ts"
import { writeFileSync } from "fs";
import { generateAsyncAPISpec } from "@alt-stack/workers-warpstream";
import { jobRouter } from "./index.js";

const spec = generateAsyncAPISpec(jobRouter, {
  title: "Real Life Workers",
  version: "1.0.0",
});

writeFileSync("asyncapi.json", JSON.stringify(spec, null, 2));
console.log("Generated asyncapi.json");
```

## SDK Generation

The generated SDK exports a `Topics` object for type-safe job triggering:

```typescript title="packages/workers-sdk/src/index.ts (generated)"
import { z } from "zod";

export const SendNotificationPayloadSchema = z.object({
  type: z.enum(["task_created", "task_completed", "task_assigned"]),
  userId: z.string(),
  taskId: z.string(),
  taskTitle: z.string(),
});

export const GenerateReportPayloadSchema = z.object({
  taskId: z.string(),
  userId: z.string(),
  completedAt: z.string(),
});

export const Topics = {
  "send-notification": SendNotificationPayloadSchema,
  "generate-report": GenerateReportPayloadSchema,
} as const;
```

## Consuming the SDK

```typescript
import { createWarpStreamClient } from "@alt-stack/workers-client-warpstream";
import { Topics } from "@real-life/workers-sdk";

const client = await createWarpStreamClient({
  bootstrapServer: "warpstream.example.com:9092",
  jobs: Topics,
});

// Type-safe: TypeScript knows the payload shape
await client.trigger("send-notification", {
  type: "task_created",  // ✅ Must be valid enum value
  userId: "user-123",
  taskId: "task-456",
  taskTitle: "My Task",
});

// ❌ TypeScript error: invalid payload
await client.trigger("send-notification", {
  invalid: "field",
});
```


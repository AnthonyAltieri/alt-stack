# Custom Context

Inject dependencies into job handlers.

## Define Context Type

```typescript
import { init } from "@alt-stack/workers-warpstream";

interface AppContext {
  db: Database;
  logger: Logger;
}

const { router, procedure } = init<AppContext>();

const jobRouter = router({
  "sync-user": procedure
    .input({ payload: z.object({ userId: z.string() }) })
    .task(async ({ input, ctx }) => {
      // Access injected dependencies
      ctx.logger.info(`Syncing user ${input.userId}`);
      const user = await ctx.db.users.find(input.userId);
      // ...
    }),
});
```

## Create Context

```typescript
import { createWorker } from "@alt-stack/workers-warpstream";

const worker = await createWorker(jobRouter, {
  kafka: { brokers: ["localhost:9092"] },
  groupId: "workers",
  createContext: async (baseCtx) => {
    // baseCtx contains: jobId, jobName, attempt, topic, partition, offset, message
    return {
      db: getDatabase(),
      logger: createLogger({ jobId: baseCtx.jobId }),
    };
  },
});
```

## Base Context

Every job handler receives these built-in fields:

```typescript
interface WarpStreamContext {
  jobId: string;      // Unique execution ID
  jobName: string;    // Name of the job
  attempt: number;    // Retry attempt (starts at 1)
  topic: string;      // Kafka topic
  partition: number;  // Kafka partition
  offset: string;     // Message offset
  message: KafkaMessage;  // Raw Kafka message
}
```


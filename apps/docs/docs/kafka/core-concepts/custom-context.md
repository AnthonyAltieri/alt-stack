# Custom Context

Extend the base context with application-specific properties.

## Base Context

Every handler receives:

```typescript
interface BaseKafkaContext {
  message: KafkaMessage; // Full kafkajs message (value, key, headers, timestamp)
  topic: string;
  partition: number;
  offset: string;
}
```

## Defining Custom Context

```typescript
import { init, kafkaRouter, createConsumer, type BaseKafkaContext } from "@alt-stack/kafka";

interface AppContext {
  logger: Logger;
  db: Database;
}

// Initialize with context type
const { procedure } = init<AppContext>();

const router = kafkaRouter<AppContext>({
  "user-events": procedure
    .input({ message: UserEventSchema })
    .subscribe(({ input, ctx }) => {
      // ctx has logger, db, plus base context
      ctx.logger.log(`Processing user ${input.userId}`);
      ctx.db.save(input);
    }),
});
```

## Creating Context

Provide `createContext` to the consumer:

```typescript
function createContext(baseCtx: BaseKafkaContext): AppContext {
  return {
    logger: {
      log: (msg: string) =>
        console.log(`[${baseCtx.topic}:${baseCtx.partition}] ${msg}`),
    },
    db: getDatabase(),
  };
}

const consumer = await createConsumer(router, {
  kafka: new Kafka({ brokers: ["localhost:9092"] }),
  groupId: "my-group",
  createContext,
});
```

## Async Context

```typescript
async function createContext(baseCtx: BaseKafkaContext): Promise<AppContext> {
  const db = await getConnectionFromPool();
  return { logger: getLogger(), db };
}
```

## Middleware Context Extension

Middleware can add to context:

```typescript
const authMiddleware = procedure.use(async ({ ctx, next }) => {
  const user = await authenticate(ctx.message.headers);
  return next({ ctx: { user } });
});

const router = kafkaRouter<AppContext>({
  protected: authMiddleware
    .input({ message: Schema })
    .subscribe(({ ctx }) => {
      // ctx.user is available
    }),
});
```

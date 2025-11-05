# Custom Context

Extend the base Kafka context with custom properties for your application.

## Base Context

Every handler receives a base context with Kafka-specific properties:

```typescript
interface BaseKafkaContext {
  message: KafkaMessage; // Full Kafka message from kafkajs
  topic: string;
  partition: number;
  offset: string;
}
```

The `message` property contains the full Kafka message object, which includes:
- `value`: The message payload (Buffer)
- `key`: Message key (Buffer | null)
- `headers`: Message headers (Record<string, Buffer | undefined>)
- `timestamp`: Message timestamp (string)

## Custom Context Types

Define your custom context type:

```typescript
interface AppContext {
  logger: {
    log: (message: string) => void;
  };
  db: Database;
  metrics: MetricsCollector;
}
```

## Creating Context

Provide a `createContext` function when creating the consumer:

```typescript
import type { BaseKafkaContext } from "@alt-stack/kafka";

function createContext(baseCtx: BaseKafkaContext): AppContext {
  return {
    logger: {
      log: (message: string) => {
        console.log(
          `[${baseCtx.topic}:${baseCtx.partition}:${baseCtx.offset}] ${message}`,
        );
      },
    },
    db: getDatabase(),
    metrics: getMetricsCollector(),
  };
}

const router = createKafkaRouter<AppContext>()
  .topic("user-events", {
    input: {
      message: UserEventSchema,
    },
  })
  .handler((ctx) => {
    // ctx.logger, ctx.db, ctx.metrics are typed
    // ctx.input is the parsed message
    ctx.logger.log("Processing event");
    ctx.db.save(ctx.input);
    ctx.metrics.increment("events.processed");
  });

const consumer = await createConsumer(router, {
  kafka: new Kafka({
    brokers: ["localhost:9092"],
  }),
  groupId: "my-consumer-group",
  createContext,
});
```

## Async Context Creation
### Example: Creating Database Connections in Context

For database connections, create them in `createContext` and reuse a connection pool:

```typescript
import { createKafkaRouter, createConsumer } from "@alt-stack/kafka";
import { Kafka } from "kafkajs";
import { z } from "zod";
import { createPool, Pool } from "your-database-library";

interface AppContext {
  db: Pool;
  logger: Logger;
}

// Create connection pool that will be reused
let dbPool: Pool | null = null;

async function createContext(
  baseCtx: BaseKafkaContext,
): Promise<AppContext> {
  // Create connection pool on first call, reuse afterwards
  if (!dbPool) {
    dbPool = createPool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      min: 2, // Minimum connections
      max: 10, // Maximum connections
    });

    // Test the connection
    await dbPool.query("SELECT 1");
    console.log("Database connection pool established");
  }

  return {
    db: dbPool, // Reuse the shared connection pool
    logger: getLogger(),
  };
}

const router = createKafkaRouter<AppContext>()
  .topic("user-events", {
    input: {
      message: z.object({
        userId: z.string(),
        eventType: z.string(),
      }),
    },
  })
  .handler(async (ctx) => {
    // Use the database connection pool
    const user = await ctx.db.query("SELECT * FROM users WHERE id = ?", [
      ctx.input.userId,
    ]);
    ctx.logger.log(`Processing ${ctx.input.eventType} for user ${user.name}`);
  });

// Main application setup
async function main() {
  const consumer = await createConsumer(router, {
    kafka: new Kafka({
      brokers: ["localhost:9092"],
    }),
    groupId: "my-consumer-group",
    createContext,
  });

  console.log("Consumer started and listening for messages...");

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down...");
    await consumer.disconnect();
    if (dbPool) {
      await dbPool.end(); // Close all connections in pool
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});
```

This pattern ensures:
- Database connection pool is created in `createContext` when first needed
- Connection pool is reused across all message processing
- Proper cleanup on application shutdown
- Better performance with connection pooling for concurrent messages

## Middleware Context Extension

Middleware can also extend context:

```typescript
const userMiddleware = createMiddleware<AppContext>(
  async ({ ctx, next }) => {
    // ctx.input is the parsed message
    const user = await getUserFromMessage(ctx.input);
    return next({ ctx: { user } });
  },
);
```


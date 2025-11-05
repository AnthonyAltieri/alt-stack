import {
  createKafkaRouter,
  createConsumer,
  createMiddleware,
  type BaseKafkaContext,
} from "@alt-stack/kafka";
import { Kafka } from "kafkajs";
import { z } from "zod";
import { env } from "./env.js";

// Define app context
interface AppContext extends Record<string, unknown> {
  logger: {
    log: (message: string) => void;
  };
}

// Create context function
function createContext(baseCtx: BaseKafkaContext): AppContext {
  return {
    logger: {
      log: (message: string) => {
        console.log(
          `[${baseCtx.topic}:${baseCtx.partition}:${baseCtx.offset}] ${message}`,
        );
      },
    },
  };
}

// Middleware for logging messages
const loggingMiddleware = createMiddleware<AppContext>(
  async (opts: {
    ctx: BaseKafkaContext & AppContext;
    next: (opts?: {
      ctx: Partial<BaseKafkaContext & AppContext>;
    }) => Promise<BaseKafkaContext & AppContext>;
  }) => {
    const { ctx, next } = opts;
    ctx.logger.log(`Processing message from topic ${ctx.topic}`);
    const result = await next();
    ctx.logger.log(`Completed processing message from topic ${ctx.topic}`);
    return result;
  },
);

// User event schema
const UserEventSchema = z.object({
  userId: z.string(),
  eventType: z.enum(["created", "updated", "deleted"]),
  timestamp: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Order item schema
const OrderItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative(),
});

// Order created schema
const OrderCreatedSchema = z.object({
  orderId: z.string(),
  userId: z.string(),
  items: z.array(OrderItemSchema),
  total: z.number().nonnegative(),
});

// Order processed output schema
const OrderProcessedSchema = z.object({
  orderId: z.string(),
  status: z.enum(["processed", "failed"]),
  processedAt: z.number(),
});

// Create router with middleware
const router = createKafkaRouter<AppContext>()
  .use(loggingMiddleware)
  .topic("user-events", {
    input: {
      message: UserEventSchema,
    },
    errors: {
      INVALID_USER: z.object({
        error: z.object({
          code: z.literal("INVALID_USER"),
          message: z.string(),
        }),
      }),
    },
  })
  .handler((ctx) => {
    // Example: Use throw ctx.error() for error handling
    if (!ctx.input.userId) {
      throw ctx.error({
        error: {
          code: "INVALID_USER",
          message: "User ID is required",
        },
      });
    }

    ctx.logger.log(
      `User event: ${ctx.input.eventType} for user ${ctx.input.userId}`,
    );

    // Process user event
    if (ctx.input.eventType === "created") {
      ctx.logger.log(`New user created: ${ctx.input.userId}`);
    } else if (ctx.input.eventType === "updated") {
      ctx.logger.log(`User updated: ${ctx.input.userId}`);
    } else if (ctx.input.eventType === "deleted") {
      ctx.logger.log(`User deleted: ${ctx.input.userId}`);
    }

    // Log metadata if present
    if (ctx.input.metadata) {
      ctx.logger.log(`Metadata: ${JSON.stringify(ctx.input.metadata)}`);
    }
  })
  .topic("orders/created", {
    input: {
      message: OrderCreatedSchema,
    },
    output: OrderProcessedSchema,
  })
  .handler((ctx) => {
    ctx.logger.log(
      `Processing order ${ctx.input.orderId} for user ${ctx.input.userId}`,
    );
    ctx.logger.log(`Order total: $${ctx.input.total.toFixed(2)}`);
    ctx.logger.log(`Items: ${ctx.input.items.length}`);

    // Simulate order processing
    const processedAt = Date.now();

    // Return processed order (will be validated against output schema)
    return {
      orderId: ctx.input.orderId,
      status: "processed" as const,
      processedAt,
    };
  });

// Create reusable procedure for notifications
const notificationRouter = createKafkaRouter<AppContext>()
  .procedure.input({
    message: z.object({
      type: z.string(),
      recipient: z.string(),
      message: z.string(),
    }),
  })
  .topic("notifications", {
    input: {
      message: z.object({
        type: z.string(),
        recipient: z.string(),
        message: z.string(),
      }),
    },
  })
  .handler((ctx) => {
    ctx.logger.log(
      `Sending ${ctx.input.type} notification to ${ctx.input.recipient}`,
    );
    ctx.logger.log(`Message: ${ctx.input.message}`);
  });

// Merge routers
router.merge("notifications", notificationRouter);

// Main function
async function main() {
  const brokers = env.KAFKA_BROKERS.split(",");
  const clientId = env.KAFKA_CLIENT_ID;
  const groupId = env.KAFKA_GROUP_ID;

  console.log(`Connecting to Kafka brokers: ${brokers.join(", ")}`);
  console.log(`Client ID: ${clientId}`);
  console.log(`Group ID: ${groupId}`);

  const kafka = new Kafka({
    clientId,
    brokers,
  });

  const consumer = await createConsumer(router, {
    kafka,
    groupId,
    createContext,
  });

  console.log("Kafka consumer started and listening for messages...");
  console.log("Press Ctrl+C to stop");

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down consumer...");
    await consumer.disconnect();
    console.log("Consumer disconnected");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Failed to start consumer:", error);
  process.exit(1);
});

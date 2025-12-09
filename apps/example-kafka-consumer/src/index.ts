import { init, kafkaRouter, createConsumer, ok, err, type BaseKafkaContext } from "@alt-stack/kafka-core";
import { TaggedError } from "@alt-stack/result";
import { Kafka } from "kafkajs";
import { z } from "zod";
import { env } from "./env.js";

// ============================================================================
// Error Classes (New Pattern)
// ============================================================================

class InvalidUserError extends TaggedError {
  readonly _tag = "InvalidUserError";
  constructor(message: string) {
    super(message);
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

interface AppContext {
  logger: {
    log: (message: string) => void;
  };
}

// ============================================================================
// Initialize Factory
// ============================================================================

const { procedure } = init<AppContext>();

// ============================================================================
// Reusable Procedures
// ============================================================================

// Public procedure (no auth required)
const publicProc = procedure;

// Procedure with logging middleware
const loggedProcedure = procedure.use(async ({ ctx, next }) => {
  ctx.logger.log(`Processing message from topic ${ctx.topic}`);
  const result = await next();
  ctx.logger.log(`Completed processing message from topic ${ctx.topic}`);
  return result;
});

// Protected procedure with validation middleware
const validatedProcedure = loggedProcedure
  .errors({
    VALIDATION_ERROR: z.object({
      error: z.object({
        code: z.literal("VALIDATION_ERROR"),
        message: z.string(),
      }),
    }),
  })
  .use(async ({ ctx, next }) => {
    ctx.logger.log("Running validation middleware");
    return next();
  });

// ============================================================================
// Schemas
// ============================================================================

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

// Notification schema
const NotificationSchema = z.object({
  type: z.string(),
  recipient: z.string(),
  message: z.string(),
});

// ============================================================================
// Router
// ============================================================================

const appRouter = kafkaRouter<AppContext>({
  // User events topic
  "user-events": validatedProcedure
    .input({ message: UserEventSchema })
    .errors({
      INVALID_USER: z.object({
        error: z.object({
          code: z.literal("INVALID_USER"),
          message: z.string(),
        }),
      }),
    })
    .subscribe(({ input, ctx }) => {
      if (!input.userId) {
        return err(new InvalidUserError("User ID is required"));
      }

      ctx.logger.log(`User event: ${input.eventType} for user ${input.userId}`);

      if (input.eventType === "created") {
        ctx.logger.log(`New user created: ${input.userId}`);
      } else if (input.eventType === "updated") {
        ctx.logger.log(`User updated: ${input.userId}`);
      } else if (input.eventType === "deleted") {
        ctx.logger.log(`User deleted: ${input.userId}`);
      }

      if (input.metadata) {
        ctx.logger.log(`Metadata: ${JSON.stringify(input.metadata)}`);
      }

      return ok();
    }),

  // Orders created topic
  "orders/created": loggedProcedure
    .input({ message: OrderCreatedSchema })
    .output(OrderProcessedSchema)
    .subscribe(({ input, ctx }) => {
      ctx.logger.log(`Processing order ${input.orderId} for user ${input.userId}`);
      ctx.logger.log(`Order total: $${input.total.toFixed(2)}`);
      ctx.logger.log(`Items: ${input.items.length}`);

      const processedAt = Date.now();

      return ok({
        orderId: input.orderId,
        status: "processed" as const,
        processedAt,
      });
    }),

  // Notifications topic
  notifications: publicProc.input({ message: NotificationSchema }).subscribe(({ input, ctx }) => {
    ctx.logger.log(`Sending ${input.type} notification to ${input.recipient}`);
    ctx.logger.log(`Message: ${input.message}`);
    return ok();
  }),
});

// ============================================================================
// Context Factory
// ============================================================================

function createContext(baseCtx: BaseKafkaContext): AppContext {
  return {
    logger: {
      log: (message: string) => {
        console.log(`[${baseCtx.topic}:${baseCtx.partition}:${baseCtx.offset}] ${message}`);
      },
    },
  };
}

// ============================================================================
// Main
// ============================================================================

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

  const consumer = await createConsumer(appRouter, {
    kafka,
    groupId,
    createContext,
  });

  console.log("Kafka consumer started and listening for messages...");
  console.log("Press Ctrl+C to stop");

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

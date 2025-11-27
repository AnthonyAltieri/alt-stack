import { init, kafkaRouter } from "@alt-stack/kafka";
import { z } from "zod";

// ============================================================================
// Schemas
// ============================================================================

// User event schema - matches what consumer expects
export const UserEventSchema = z.object({
  userId: z.string(),
  eventType: z.enum(["created", "updated", "deleted"]),
  timestamp: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Order item schema
export const OrderItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative(),
});

// Order created schema
export const OrderCreatedSchema = z.object({
  orderId: z.string(),
  userId: z.string(),
  items: z.array(OrderItemSchema),
  total: z.number().nonnegative(),
});

// Notification schema
export const NotificationSchema = z.object({
  type: z.string(),
  recipient: z.string(),
  message: z.string(),
});

// ============================================================================
// Router Definition
// ============================================================================

// Initialize without custom context for producer
const { procedure } = init();

// Define the producer router - topics with input schemas
// This defines what messages can be produced to each topic
export const producerRouter = kafkaRouter({
  // User events topic
  "user-events": procedure
    .input({ message: UserEventSchema })
    .subscribe(() => {
      // Producer-side handler is optional, used for spec generation
    }),

  // Orders created topic
  "orders/created": procedure
    .input({ message: OrderCreatedSchema })
    .subscribe(() => {}),

  // Notifications topic
  notifications: procedure
    .input({ message: NotificationSchema })
    .subscribe(() => {}),
});

export type ProducerRouter = typeof producerRouter;


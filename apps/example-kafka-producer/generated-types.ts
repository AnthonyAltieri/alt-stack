/**
 * This file was automatically generated from AsyncAPI schema
 * Do not manually edit this file
 */

import { z } from 'zod';

// Component Schemas
export const UserEventsPayloadSchema = z.object({ userId: z.string(), eventType: z.enum(['created', 'updated', 'deleted']), timestamp: z.number(), metadata: z.record(z.string(), z.unknown()).optional() });
export type UserEventsPayload = z.infer<typeof UserEventsPayloadSchema>;

export const OrdersCreatedPayloadSchema = z.object({ orderId: z.string(), userId: z.string(), items: z.array(z.object({ productId: z.string(), quantity: z.number().int().max(9007199254740991), price: z.number().min(0) })), total: z.number().min(0) });
export type OrdersCreatedPayload = z.infer<typeof OrdersCreatedPayloadSchema>;

export const NotificationsPayloadSchema = z.object({ type: z.string(), recipient: z.string(), message: z.string() });
export type NotificationsPayload = z.infer<typeof NotificationsPayloadSchema>;

// Topic Message Schemas
export const UserEventsMessageSchema = z.object({ userId: z.string(), eventType: z.enum(['created', 'updated', 'deleted']), timestamp: z.number(), metadata: z.record(z.string(), z.unknown()).optional() });
export type UserEventsMessage = z.infer<typeof UserEventsMessageSchema>;

export const OrdersCreatedMessageSchema = z.object({ orderId: z.string(), userId: z.string(), items: z.array(z.object({ productId: z.string(), quantity: z.number().int().max(9007199254740991), price: z.number().min(0) })), total: z.number().min(0) });
export type OrdersCreatedMessage = z.infer<typeof OrdersCreatedMessageSchema>;

export const NotificationsMessageSchema = z.object({ type: z.string(), recipient: z.string(), message: z.string() });
export type NotificationsMessage = z.infer<typeof NotificationsMessageSchema>;

// Topics Object
export const Topics = {
  'user-events': UserEventsMessageSchema,
  'orders/created': OrdersCreatedMessageSchema,
  'notifications': NotificationsMessageSchema
} as const;

export type TopicName = keyof typeof Topics;
export type MessageType<T extends TopicName> = z.infer<typeof Topics[T]>;
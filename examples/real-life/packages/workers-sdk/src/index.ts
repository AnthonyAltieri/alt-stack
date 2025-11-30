/**
 * This file will be auto-generated from AsyncAPI schema.
 * Run `pnpm generate` after generating the AsyncAPI spec.
 *
 * Placeholder exports for type checking before generation:
 */

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

export type TopicName = keyof typeof Topics;
export type MessageType<T extends TopicName> = z.infer<(typeof Topics)[T]>;

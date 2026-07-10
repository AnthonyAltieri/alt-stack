/**
 * This file was automatically generated from AsyncAPI schema
 * Do not manually edit this file
 */

/* eslint-disable no-useless-escape -- generated regex literals preserve source patterns */

import { z } from 'zod';

// Component Schemas
export const SendNotificationPayloadSchema = z.object({ type: z.enum(['task_created', 'task_completed', 'task_assigned']), userId: z.string(), taskId: z.string(), taskTitle: z.string() });
export type SendNotificationPayload = z.infer<typeof SendNotificationPayloadSchema>;

export const GenerateReportPayloadSchema = z.object({ taskId: z.string(), userId: z.string(), completedAt: z.string().regex(/^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z))$/) });
export type GenerateReportPayload = z.infer<typeof GenerateReportPayloadSchema>;

// Topic Message Schemas
export const SendNotificationMessageSchema = SendNotificationPayloadSchema;
export type SendNotificationMessage = z.infer<typeof SendNotificationMessageSchema>;

export const GenerateReportMessageSchema = GenerateReportPayloadSchema;
export type GenerateReportMessage = z.infer<typeof GenerateReportMessageSchema>;

// Topics Object
export const Topics = {
  'send-notification': SendNotificationPayloadSchema,
  'generate-report': GenerateReportPayloadSchema
} as const;

export type TopicName = keyof typeof Topics;
export type MessageType<T extends TopicName> = z.infer<typeof Topics[T]>;
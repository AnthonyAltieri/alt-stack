/**
 * This file will be auto-generated from OpenAPI schema.
 * Run `pnpm generate` after generating the OpenAPI spec.
 *
 * Placeholder exports for type checking before generation:
 */

import { z } from "zod";

// Schemas
export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed"]),
  userId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof TaskSchema>;

// Request schemas
export const Request = {
  "/api/": {
    GET: {},
    POST: {
      body: z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
      }),
    },
  },
  "/api/{id}": {
    GET: {
      params: z.object({ id: z.string().uuid() }),
    },
    PUT: {
      params: z.object({ id: z.string().uuid() }),
      body: z.object({
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).optional(),
        status: z.enum(["pending", "in_progress", "completed"]).optional(),
      }),
    },
    DELETE: {
      params: z.object({ id: z.string().uuid() }),
    },
  },
} as const;

// Response schemas
export const Response = {
  "/api/": {
    GET: {
      "200": z.array(TaskSchema),
    },
    POST: {
      "200": TaskSchema,
      "401": z.object({
        error: z.object({ code: z.literal("UNAUTHORIZED"), message: z.string() }),
      }),
    },
  },
  "/api/{id}": {
    GET: {
      "200": TaskSchema,
      "404": z.object({
        error: z.object({ code: z.literal("NOT_FOUND"), message: z.string() }),
      }),
    },
    PUT: {
      "200": TaskSchema,
      "401": z.object({
        error: z.object({ code: z.literal("UNAUTHORIZED"), message: z.string() }),
      }),
      "403": z.object({
        error: z.object({ code: z.literal("FORBIDDEN"), message: z.string() }),
      }),
      "404": z.object({
        error: z.object({ code: z.literal("NOT_FOUND"), message: z.string() }),
      }),
    },
    DELETE: {
      "200": z.object({ success: z.boolean() }),
      "401": z.object({
        error: z.object({ code: z.literal("UNAUTHORIZED"), message: z.string() }),
      }),
      "403": z.object({
        error: z.object({ code: z.literal("FORBIDDEN"), message: z.string() }),
      }),
      "404": z.object({
        error: z.object({ code: z.literal("NOT_FOUND"), message: z.string() }),
      }),
    },
  },
} as const;

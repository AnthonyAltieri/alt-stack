/**
 * This file will be auto-generated from OpenAPI schema.
 * Run `pnpm generate` after generating the OpenAPI spec.
 *
 * Placeholder exports for type checking before generation:
 */

import { z } from "zod";

// Schemas
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const SessionSchema = z.object({
  token: z.string(),
  userId: z.string(),
  expiresAt: z.string(),
});
export type Session = z.infer<typeof SessionSchema>;

// Request schemas
export const Request = {
  "/api/signup": {
    POST: {
      body: z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(1),
      }),
    },
  },
  "/api/login": {
    POST: {
      body: z.object({
        email: z.string().email(),
        password: z.string(),
      }),
    },
  },
  "/api/logout": {
    POST: {},
  },
  "/api/me": {
    GET: {},
  },
  "/api/validate": {
    GET: {},
  },
} as const;

// Response schemas
export const Response = {
  "/api/signup": {
    POST: {
      "200": z.object({ user: UserSchema, session: SessionSchema }),
      "409": z.object({
        error: z.object({ code: z.literal("EMAIL_EXISTS"), message: z.string() }),
      }),
    },
  },
  "/api/login": {
    POST: {
      "200": z.object({ user: UserSchema, session: SessionSchema }),
      "401": z.object({
        error: z.object({ code: z.literal("INVALID_CREDENTIALS"), message: z.string() }),
      }),
    },
  },
  "/api/logout": {
    POST: {
      "200": z.object({ success: z.boolean() }),
    },
  },
  "/api/me": {
    GET: {
      "200": UserSchema,
      "401": z.object({
        error: z.object({ code: z.literal("UNAUTHORIZED"), message: z.string() }),
      }),
    },
  },
  "/api/validate": {
    GET: {
      "200": z.object({ valid: z.boolean(), userId: z.string().optional() }),
    },
  },
} as const;

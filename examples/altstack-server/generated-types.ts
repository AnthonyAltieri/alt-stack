/**
 * This file was automatically generated from OpenAPI schema
 * Do not manually edit this file
 */

import { z } from "zod";
import { createApiClient } from "../../packages/client/src";

export const GetTodosResponseSchema = z.array(
  z
    .object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      completed: z.boolean(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
    .strict(),
);
export type GetTodosResponse = z.infer<typeof GetTodosResponseSchema>;

export const GetTodosIdResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    completed: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type GetTodosIdResponse = z.infer<typeof GetTodosIdResponseSchema>;

export const GetTodosId404ErrorSchema = z
  .object({
    error: z
      .object({ code: z.enum(["NOT_FOUND"]), message: z.string() })
      .strict(),
  })
  .strict();
export type GetTodosId404Error = z.infer<typeof GetTodosId404ErrorSchema>;

export const PostTodosBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});
export type PostTodosBody = z.infer<typeof PostTodosBodySchema>;

export const PostTodos400ErrorSchema = z
  .object({
    error: z
      .object({ code: z.enum(["VALIDATION_ERROR"]), message: z.string() })
      .strict(),
  })
  .strict();
export type PostTodos400Error = z.infer<typeof PostTodos400ErrorSchema>;

export const PatchTodosIdBodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  completed: z.boolean().optional(),
});
export type PatchTodosIdBody = z.infer<typeof PatchTodosIdBodySchema>;

export const DeleteTodosIdResponseSchema = z
  .object({ success: z.boolean() })
  .strict();
export type DeleteTodosIdResponse = z.infer<typeof DeleteTodosIdResponseSchema>;

export const GetAuthProfileResponseSchema = z
  .object({ id: z.string(), email: z.string(), name: z.string() })
  .strict();
export type GetAuthProfileResponse = z.infer<
  typeof GetAuthProfileResponseSchema
>;

export const GetAuthProfile401ErrorSchema = z
  .object({
    error: z
      .object({ code: z.enum(["UNAUTHORIZED"]), message: z.string() })
      .strict(),
  })
  .strict();
export type GetAuthProfile401Error = z.infer<
  typeof GetAuthProfile401ErrorSchema
>;

export const GetAuthSettingsResponseSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    preferences: z
      .object({ theme: z.string(), notifications: z.boolean() })
      .strict(),
  })
  .strict();
export type GetAuthSettingsResponse = z.infer<
  typeof GetAuthSettingsResponseSchema
>;

export const GetAuthSettings401ErrorSchema = z.unknown();
export type GetAuthSettings401Error = z.infer<
  typeof GetAuthSettings401ErrorSchema
>;

export const GetAuthSettings403ErrorSchema = z
  .object({
    error: z
      .object({ code: z.enum(["FORBIDDEN"]), message: z.string() })
      .strict(),
  })
  .strict();
export type GetAuthSettings403Error = z.infer<
  typeof GetAuthSettings403ErrorSchema
>;

export const GetTodosQuery = z.object({
  completed: z.enum(["true", "false"]).optional(),
});
export const GetTodos200Response = GetTodosResponseSchema;
export const PostTodosBody = PostTodosBodySchema;
export const PostTodos200Response = GetTodosIdResponseSchema;
export const PostTodos400ErrorResponse = PostTodos400ErrorSchema;
export const GetTodosIdParams = z.object({ id: z.string() });
export const GetTodosId200Response = GetTodosIdResponseSchema;
export const GetTodosId404ErrorResponse = GetTodosId404ErrorSchema;
export const PatchTodosIdParams = z.object({ id: z.string() });
export const PatchTodosIdBody = PatchTodosIdBodySchema;
export const PatchTodosId200Response = GetTodosIdResponseSchema;
export const PatchTodosId400ErrorResponse = PostTodos400ErrorSchema;
export const PatchTodosId404ErrorResponse = GetTodosId404ErrorSchema;
export const DeleteTodosIdParams = z.object({ id: z.string() });
export const DeleteTodosId200Response = DeleteTodosIdResponseSchema;
export const DeleteTodosId404ErrorResponse = GetTodosId404ErrorSchema;
export const GetAuthProfile200Response = GetAuthProfileResponseSchema;
export const GetAuthProfile401ErrorResponse = GetAuthProfile401ErrorSchema;
export const GetAuthProfile404ErrorResponse = GetTodosId404ErrorSchema;
export const GetAuthSettings200Response = GetAuthSettingsResponseSchema;
export const GetAuthSettings401ErrorResponse = GetAuthSettings401ErrorSchema;
export const GetAuthSettings403ErrorResponse = GetAuthSettings403ErrorSchema;

export const Request = {
  "/todos": {
    GET: {
      query: GetTodosQuery,
    },
    POST: {
      body: PostTodosBody,
    },
  },
  "/todos/{id}": {
    GET: {
      params: GetTodosIdParams,
    },
    PATCH: {
      params: PatchTodosIdParams,
      body: PatchTodosIdBody,
    },
    DELETE: {
      params: DeleteTodosIdParams,
    },
  },
} as const;

export const Response = {
  "/todos": {
    GET: {
      "200": GetTodos200Response,
    },
    POST: {
      "200": PostTodos200Response,
      "400": PostTodos400ErrorResponse,
    },
  },
  "/todos/{id}": {
    GET: {
      "200": GetTodosId200Response,
      "404": GetTodosId404ErrorResponse,
    },
    PATCH: {
      "200": PatchTodosId200Response,
      "400": PatchTodosId400ErrorResponse,
      "404": PatchTodosId404ErrorResponse,
    },
    DELETE: {
      "200": DeleteTodosId200Response,
      "404": DeleteTodosId404ErrorResponse,
    },
  },
  "/auth/profile": {
    GET: {
      "200": GetAuthProfile200Response,
      "401": GetAuthProfile401ErrorResponse,
      "404": GetAuthProfile404ErrorResponse,
    },
  },
  "/auth/settings": {
    GET: {
      "200": GetAuthSettings200Response,
      "401": GetAuthSettings401ErrorResponse,
      "403": GetAuthSettings403ErrorResponse,
    },
  },
} as const;

const client = createApiClient({
  baseUrl: "example.com",
  Request,
  Response,
});

client.get("/todos/{id}", {
  params: { id: "test" },
});
client.post("/todos", {
  body: { title: "something" },
});

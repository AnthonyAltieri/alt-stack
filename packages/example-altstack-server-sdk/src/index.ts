/**
 * This file was automatically generated from OpenAPI schema
 * Do not manually edit this file
 */

import { z } from 'zod';

export const GetApiTodosResponseSchema = z.array(z.object({ id: z.string(), title: z.string(), description: z.string().optional(), completed: z.boolean(), createdAt: z.string(), userId: z.string() }).strict());
export type GetApiTodosResponse = z.infer<typeof GetApiTodosResponseSchema>;

export const PostApiTodosBodySchema = z.object({ title: z.string().min(1).max(200), description: z.string().max(1000).optional() });
export type PostApiTodosBody = z.infer<typeof PostApiTodosBodySchema>;

export const PostApiTodosResponseSchema = z.object({ id: z.string(), title: z.string(), description: z.string().optional(), completed: z.boolean(), createdAt: z.string(), userId: z.string() }).strict();
export type PostApiTodosResponse = z.infer<typeof PostApiTodosResponseSchema>;

export const PostApiTodos401ErrorSchema = z.object({ error: z.object({ code: z.enum(['UNAUTHORIZED']), message: z.string() }).strict() }).strict();
export type PostApiTodos401Error = z.infer<typeof PostApiTodos401ErrorSchema>;

export const GetApiTodosId404ErrorSchema = z.object({ error: z.object({ code: z.enum(['NOT_FOUND']), message: z.string() }).strict() }).strict();
export type GetApiTodosId404Error = z.infer<typeof GetApiTodosId404ErrorSchema>;

export const PutApiTodosIdBodySchema = z.object({ title: z.string().min(1).max(200).optional(), description: z.string().max(1000).optional(), completed: z.boolean().optional() });
export type PutApiTodosIdBody = z.infer<typeof PutApiTodosIdBodySchema>;

export const PutApiTodosId400ErrorSchema = z.object({ error: z.object({ code: z.enum(['CUSTOM_VALIDATION_ERROR']), message: z.string(), field: z.string() }).strict() }).strict();
export type PutApiTodosId400Error = z.infer<typeof PutApiTodosId400ErrorSchema>;

export const PutApiTodosId403ErrorSchema = z.object({ error: z.object({ code: z.enum(['FORBIDDEN']), message: z.string() }).strict() }).strict();
export type PutApiTodosId403Error = z.infer<typeof PutApiTodosId403ErrorSchema>;

export const DeleteApiTodosIdResponseSchema = z.object({ success: z.boolean() }).strict();
export type DeleteApiTodosIdResponse = z.infer<typeof DeleteApiTodosIdResponseSchema>;

export const PatchApiTodosIdCompleteBodySchema = z.object({ completed: z.boolean() });
export type PatchApiTodosIdCompleteBody = z.infer<typeof PatchApiTodosIdCompleteBodySchema>;

export const GetApiUsersMeResponseSchema = z.object({ id: z.string(), email: z.string(), role: z.enum(['admin', 'user']) }).strict();
export type GetApiUsersMeResponse = z.infer<typeof GetApiUsersMeResponseSchema>;

export const GetApiUsersIdResponseSchema = z.object({ id: z.string(), email: z.string() }).strict();
export type GetApiUsersIdResponse = z.infer<typeof GetApiUsersIdResponseSchema>;

export const GetApiAdminUsersResponseSchema = z.array(z.object({ id: z.string(), email: z.string(), role: z.enum(['admin', 'user']) }).strict());
export type GetApiAdminUsersResponse = z.infer<typeof GetApiAdminUsersResponseSchema>;

export const GetApiTodosQuery = z.object({ completed: z.enum(['true', 'false']).optional(), limit: z.number().int().max(9007199254740991).optional(), offset: z.number().int().min(0).max(9007199254740991).optional() });
export const GetApiTodos200Response = GetApiTodosResponseSchema;
export const PostApiTodosBody = PostApiTodosBodySchema;
export const PostApiTodos200Response = PostApiTodosResponseSchema;
export const PostApiTodos401ErrorResponse = PostApiTodos401ErrorSchema;
export const GetApiTodosIdParams = z.object({ id: z.string().uuid().regex(/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/) });
export const GetApiTodosId200Response = PostApiTodosResponseSchema;
export const GetApiTodosId404ErrorResponse = GetApiTodosId404ErrorSchema;
export const PutApiTodosIdParams = z.object({ id: z.string().uuid().regex(/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/) });
export const PutApiTodosIdQuery = z.object({ notify: z.boolean().optional() });
export const PutApiTodosIdBody = PutApiTodosIdBodySchema;
export const PutApiTodosId200Response = PostApiTodosResponseSchema;
export const PutApiTodosId400ErrorResponse = PutApiTodosId400ErrorSchema;
export const PutApiTodosId401ErrorResponse = PostApiTodos401ErrorSchema;
export const PutApiTodosId403ErrorResponse = PutApiTodosId403ErrorSchema;
export const PutApiTodosId404ErrorResponse = GetApiTodosId404ErrorSchema;
export const DeleteApiTodosIdParams = z.object({ id: z.string().uuid().regex(/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/) });
export const DeleteApiTodosId200Response = DeleteApiTodosIdResponseSchema;
export const DeleteApiTodosId401ErrorResponse = PostApiTodos401ErrorSchema;
export const DeleteApiTodosId404ErrorResponse = GetApiTodosId404ErrorSchema;
export const PatchApiTodosIdCompleteParams = z.object({ id: z.string().uuid().regex(/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/) });
export const PatchApiTodosIdCompleteBody = PatchApiTodosIdCompleteBodySchema;
export const PatchApiTodosIdComplete200Response = PostApiTodosResponseSchema;
export const PatchApiTodosIdComplete401ErrorResponse = PostApiTodos401ErrorSchema;
export const PatchApiTodosIdComplete404ErrorResponse = GetApiTodosId404ErrorSchema;
export const GetApiUsersMe200Response = GetApiUsersMeResponseSchema;
export const GetApiUsersMe401ErrorResponse = PostApiTodos401ErrorSchema;
export const GetApiUsersIdParams = z.object({ id: z.string().uuid().regex(/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/) });
export const GetApiUsersId200Response = GetApiUsersIdResponseSchema;
export const GetApiUsersId404ErrorResponse = GetApiTodosId404ErrorSchema;
export const GetApiAdminUsersQuery = z.object({ role: z.enum(['admin', 'user']).optional() });
export const GetApiAdminUsers200Response = GetApiAdminUsersResponseSchema;
export const GetApiAdminUsers401ErrorResponse = PostApiTodos401ErrorSchema;
export const GetApiAdminUsers403ErrorResponse = PutApiTodosId403ErrorSchema;
export const DeleteApiAdminUsersIdParams = z.object({ id: z.string().uuid().regex(/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/) });
export const DeleteApiAdminUsersId200Response = DeleteApiTodosIdResponseSchema;
export const DeleteApiAdminUsersId401ErrorResponse = PostApiTodos401ErrorSchema;
export const DeleteApiAdminUsersId403ErrorResponse = PutApiTodosId403ErrorSchema;
export const DeleteApiAdminUsersId404ErrorResponse = GetApiTodosId404ErrorSchema;

export const Request = {
  '/api/todos': {
    GET: {
      query: GetApiTodosQuery,
    },
    POST: {
      body: PostApiTodosBody,
    },
  },
  '/api/todos/{id}': {
    GET: {
      params: GetApiTodosIdParams,
    },
    PUT: {
      params: PutApiTodosIdParams,
      query: PutApiTodosIdQuery,
      body: PutApiTodosIdBody,
    },
    DELETE: {
      params: DeleteApiTodosIdParams,
    },
  },
  '/api/todos/{id}/complete': {
    PATCH: {
      params: PatchApiTodosIdCompleteParams,
      body: PatchApiTodosIdCompleteBody,
    },
  },
  '/api/users/{id}': {
    GET: {
      params: GetApiUsersIdParams,
    },
  },
  '/api/admin/users': {
    GET: {
      query: GetApiAdminUsersQuery,
    },
  },
  '/api/admin/users/{id}': {
    DELETE: {
      params: DeleteApiAdminUsersIdParams,
    },
  },
} as const;

export const Response = {
  '/api/todos': {
    GET: {
      '200': GetApiTodos200Response,
    },
    POST: {
      '200': PostApiTodos200Response,
      '401': PostApiTodos401ErrorResponse,
    },
  },
  '/api/todos/{id}': {
    GET: {
      '200': GetApiTodosId200Response,
      '404': GetApiTodosId404ErrorResponse,
    },
    PUT: {
      '200': PutApiTodosId200Response,
      '400': PutApiTodosId400ErrorResponse,
      '401': PutApiTodosId401ErrorResponse,
      '403': PutApiTodosId403ErrorResponse,
      '404': PutApiTodosId404ErrorResponse,
    },
    DELETE: {
      '200': DeleteApiTodosId200Response,
      '401': DeleteApiTodosId401ErrorResponse,
      '404': DeleteApiTodosId404ErrorResponse,
    },
  },
  '/api/todos/{id}/complete': {
    PATCH: {
      '200': PatchApiTodosIdComplete200Response,
      '401': PatchApiTodosIdComplete401ErrorResponse,
      '404': PatchApiTodosIdComplete404ErrorResponse,
    },
  },
  '/api/users/me': {
    GET: {
      '200': GetApiUsersMe200Response,
      '401': GetApiUsersMe401ErrorResponse,
    },
  },
  '/api/users/{id}': {
    GET: {
      '200': GetApiUsersId200Response,
      '404': GetApiUsersId404ErrorResponse,
    },
  },
  '/api/admin/users': {
    GET: {
      '200': GetApiAdminUsers200Response,
      '401': GetApiAdminUsers401ErrorResponse,
      '403': GetApiAdminUsers403ErrorResponse,
    },
  },
  '/api/admin/users/{id}': {
    DELETE: {
      '200': DeleteApiAdminUsersId200Response,
      '401': DeleteApiAdminUsersId401ErrorResponse,
      '403': DeleteApiAdminUsersId403ErrorResponse,
      '404': DeleteApiAdminUsersId404ErrorResponse,
    },
  },
} as const;
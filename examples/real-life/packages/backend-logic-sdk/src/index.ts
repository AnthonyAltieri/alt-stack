/**
 * This file was automatically generated from OpenAPI schema
 * Do not manually edit this file
 */

/* eslint-disable no-useless-escape -- generated regex literals preserve source patterns */

import { z } from 'zod';

// Type assertion helper - verifies interface matches schema at compile time
type _AssertEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : never) : never;

export type GetApiResponse = Array<{ id: string; title: string; description?: string; status: "pending" | "in_progress" | "completed"; userId: string; createdAt: string; updatedAt: string }>;
export const GetApiResponseSchema = z.array(z.object({ id: z.string(), title: z.string(), description: z.string().optional(), status: z.enum(['pending', 'in_progress', 'completed']), userId: z.string(), createdAt: z.string().datetime().regex(/^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z))$/).meta({"openapi":{"format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"}}), updatedAt: z.string().datetime().regex(/^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z))$/).meta({"openapi":{"format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"}}) }).strict());

export interface PostApiBody {
  title: string;
  description?: string;
}
export const PostApiBodySchema = z.object({ title: z.string().min(1).max(200), description: z.string().max(1000).optional() });

export interface PostApiResponse {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed";
  userId: string;
  createdAt: string;
  updatedAt: string;
}
export const PostApiResponseSchema = z.object({ id: z.string(), title: z.string(), description: z.string().optional(), status: z.enum(['pending', 'in_progress', 'completed']), userId: z.string(), createdAt: z.string().datetime().regex(/^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z))$/).meta({"openapi":{"format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"}}), updatedAt: z.string().datetime().regex(/^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z))$/).meta({"openapi":{"format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"}}) }).strict();

export interface PostApi401Error {
  _tag: "UnauthorizedError";
  message: string;
}
export const PostApi401ErrorSchema = z.object({ _tag: z.enum(['UnauthorizedError']), message: z.string() }).strict();

export interface GetApiId404Error {
  _tag: "NotFoundError";
  message: string;
}
export const GetApiId404ErrorSchema = z.object({ _tag: z.enum(['NotFoundError']), message: z.string() }).strict();

export interface PutApiIdBody {
  title?: string;
  description?: string;
  status?: "pending" | "in_progress" | "completed";
}
export const PutApiIdBodySchema = z.object({ title: z.string().min(1).max(200).optional(), description: z.string().max(1000).optional(), status: z.enum(['pending', 'in_progress', 'completed']).optional() });

export interface PutApiId403Error {
  _tag: "ForbiddenError";
  message: string;
}
export const PutApiId403ErrorSchema = z.object({ _tag: z.enum(['ForbiddenError']), message: z.string() }).strict();

export interface DeleteApiIdResponse {
  success: boolean;
}
export const DeleteApiIdResponseSchema = z.object({ success: z.boolean() }).strict();

// Compile-time type assertions - ensure interfaces match schemas
type _AssertGetApiResponse = _AssertEqual<GetApiResponse, z.infer<typeof GetApiResponseSchema>>;
type _AssertPostApiBody = _AssertEqual<PostApiBody, z.infer<typeof PostApiBodySchema>>;
type _AssertPostApiResponse = _AssertEqual<PostApiResponse, z.infer<typeof PostApiResponseSchema>>;
type _AssertPostApi401Error = _AssertEqual<PostApi401Error, z.infer<typeof PostApi401ErrorSchema>>;
type _AssertGetApiId404Error = _AssertEqual<GetApiId404Error, z.infer<typeof GetApiId404ErrorSchema>>;
type _AssertPutApiIdBody = _AssertEqual<PutApiIdBody, z.infer<typeof PutApiIdBodySchema>>;
type _AssertPutApiId403Error = _AssertEqual<PutApiId403Error, z.infer<typeof PutApiId403ErrorSchema>>;
type _AssertDeleteApiIdResponse = _AssertEqual<DeleteApiIdResponse, z.infer<typeof DeleteApiIdResponseSchema>>;

// Common Error Schemas (deduplicated)
export const PostApi200Response = PostApiResponseSchema;
export const PostApi401ErrorResponse = PostApi401ErrorSchema;
export const GetApiId404ErrorResponse = GetApiId404ErrorSchema;
export const PutApiId403ErrorResponse = PutApiId403ErrorSchema;

// Route Schemas
export const GetApi200Response = GetApiResponseSchema;
export const PostApiBody = PostApiBodySchema;
export const GetApiIdParams = z.object({ id: z.string().uuid().regex(/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/).meta({"openapi":{"format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}}) });
export const GetApiId200Response = PostApi200Response;
export const PutApiIdParams = GetApiIdParams;
export const PutApiIdBody = PutApiIdBodySchema;
export const PutApiId200Response = PostApi200Response;
export const PutApiId401ErrorResponse = PostApi401ErrorResponse;
export const PutApiId404ErrorResponse = GetApiId404ErrorResponse;
export const DeleteApiIdParams = GetApiIdParams;
export const DeleteApiId200Response = DeleteApiIdResponseSchema;
export const DeleteApiId401ErrorResponse = PostApi401ErrorResponse;
export const DeleteApiId403ErrorResponse = PutApiId403ErrorResponse;
export const DeleteApiId404ErrorResponse = GetApiId404ErrorResponse;

export const Request = {
  '/api': {
    GET: {},
    POST: {
      body: PostApiBody,
    },
  },
  '/api/{id}': {
    GET: {
      params: GetApiIdParams,
    },
    PUT: {
      params: GetApiIdParams,
      body: PutApiIdBody,
    },
    DELETE: {
      params: GetApiIdParams,
    },
  },
} as const;

export const Response = {
  '/api': {
    GET: {
      '200': GetApi200Response,
    },
    POST: {
      '200': PostApi200Response,
      '401': PostApi401ErrorResponse,
    },
  },
  '/api/{id}': {
    GET: {
      '200': PostApi200Response,
      '404': GetApiId404ErrorResponse,
    },
    PUT: {
      '200': PostApi200Response,
      '401': PostApi401ErrorResponse,
      '403': PutApiId403ErrorResponse,
      '404': GetApiId404ErrorResponse,
    },
    DELETE: {
      '200': DeleteApiId200Response,
      '401': PostApi401ErrorResponse,
      '403': PutApiId403ErrorResponse,
      '404': GetApiId404ErrorResponse,
    },
  },
} as const;
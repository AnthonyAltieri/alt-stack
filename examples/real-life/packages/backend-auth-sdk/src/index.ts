/**
 * This file was automatically generated from OpenAPI schema
 * Do not manually edit this file
 */

/* eslint-disable no-useless-escape -- generated regex literals preserve source patterns */

import { z } from 'zod';

// Type assertion helper - verifies interface matches schema at compile time
type _AssertEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : never) : never;

export interface PostApiSignupBody {
  email: string;
  password: string;
  name: string;
}
export const PostApiSignupBodySchema = z.object({ email: z.string().email().regex(/^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/).meta({"openapi":{"format":"email","pattern":"^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"}}), password: z.string().min(8), name: z.string().min(1) });

export interface PostApiSignupResponse {
  user: { id: string; email: string; name: string };
  session: { token: string; userId: string; expiresAt: string };
}
export const PostApiSignupResponseSchema = z.object({ user: z.object({ id: z.string(), email: z.string().email().regex(/^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/).meta({"openapi":{"format":"email","pattern":"^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"}}), name: z.string() }).strict(), session: z.object({ token: z.string(), userId: z.string(), expiresAt: z.string().datetime().regex(/^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z))$/).meta({"openapi":{"format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"}}) }).strict() }).strict();

export interface PostApiSignup409Error {
  _tag: "EmailExistsError";
  message: string;
}
export const PostApiSignup409ErrorSchema = z.object({ _tag: z.enum(['EmailExistsError']), message: z.string() }).strict();

export interface PostApiLoginBody {
  email: string;
  password: string;
}
export const PostApiLoginBodySchema = z.object({ email: z.string().email().regex(/^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/).meta({"openapi":{"format":"email","pattern":"^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"}}), password: z.string() });

export interface PostApiLogin401Error {
  _tag: "InvalidCredentialsError";
  message: string;
}
export const PostApiLogin401ErrorSchema = z.object({ _tag: z.enum(['InvalidCredentialsError']), message: z.string() }).strict();

export interface PostApiLogoutResponse {
  success: boolean;
}
export const PostApiLogoutResponseSchema = z.object({ success: z.boolean() }).strict();

export interface GetApiMeResponse {
  id: string;
  email: string;
  name: string;
}
export const GetApiMeResponseSchema = z.object({ id: z.string(), email: z.string().email().regex(/^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/).meta({"openapi":{"format":"email","pattern":"^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"}}), name: z.string() }).strict();

export interface GetApiMe401Error {
  _tag: "UnauthorizedError";
  message: string;
}
export const GetApiMe401ErrorSchema = z.object({ _tag: z.enum(['UnauthorizedError']), message: z.string() }).strict();

export interface GetApiValidateResponse {
  valid: boolean;
  userId?: string;
}
export const GetApiValidateResponseSchema = z.object({ valid: z.boolean(), userId: z.string().optional() }).strict();

// Compile-time type assertions - ensure interfaces match schemas
type _AssertPostApiSignupBody = _AssertEqual<PostApiSignupBody, z.infer<typeof PostApiSignupBodySchema>>;
type _AssertPostApiSignupResponse = _AssertEqual<PostApiSignupResponse, z.infer<typeof PostApiSignupResponseSchema>>;
type _AssertPostApiSignup409Error = _AssertEqual<PostApiSignup409Error, z.infer<typeof PostApiSignup409ErrorSchema>>;
type _AssertPostApiLoginBody = _AssertEqual<PostApiLoginBody, z.infer<typeof PostApiLoginBodySchema>>;
type _AssertPostApiLogin401Error = _AssertEqual<PostApiLogin401Error, z.infer<typeof PostApiLogin401ErrorSchema>>;
type _AssertPostApiLogoutResponse = _AssertEqual<PostApiLogoutResponse, z.infer<typeof PostApiLogoutResponseSchema>>;
type _AssertGetApiMeResponse = _AssertEqual<GetApiMeResponse, z.infer<typeof GetApiMeResponseSchema>>;
type _AssertGetApiMe401Error = _AssertEqual<GetApiMe401Error, z.infer<typeof GetApiMe401ErrorSchema>>;
type _AssertGetApiValidateResponse = _AssertEqual<GetApiValidateResponse, z.infer<typeof GetApiValidateResponseSchema>>;

// Common Error Schemas (deduplicated)
export const PostApiSignup200Response = PostApiSignupResponseSchema;

// Route Schemas
export const PostApiSignupBody = PostApiSignupBodySchema;
export const PostApiSignup409ErrorResponse = PostApiSignup409ErrorSchema;
export const PostApiLoginBody = PostApiLoginBodySchema;
export const PostApiLogin200Response = PostApiSignup200Response;
export const PostApiLogin401ErrorResponse = PostApiLogin401ErrorSchema;
export const PostApiLogout200Response = PostApiLogoutResponseSchema;
export const GetApiMe200Response = GetApiMeResponseSchema;
export const GetApiMe401ErrorResponse = GetApiMe401ErrorSchema;
export const GetApiValidate200Response = GetApiValidateResponseSchema;

export const Request = {
  '/api/signup': {
    POST: {
      body: PostApiSignupBody,
    },
  },
  '/api/login': {
    POST: {
      body: PostApiLoginBody,
    },
  },
  '/api/logout': {
    POST: {},
  },
  '/api/me': {
    GET: {},
  },
  '/api/validate': {
    GET: {},
  },
} as const;

export const Response = {
  '/api/signup': {
    POST: {
      '200': PostApiSignup200Response,
      '409': PostApiSignup409ErrorResponse,
    },
  },
  '/api/login': {
    POST: {
      '200': PostApiSignup200Response,
      '401': PostApiLogin401ErrorResponse,
    },
  },
  '/api/logout': {
    POST: {
      '200': PostApiLogout200Response,
    },
  },
  '/api/me': {
    GET: {
      '200': GetApiMe200Response,
      '401': GetApiMe401ErrorResponse,
    },
  },
  '/api/validate': {
    GET: {
      '200': GetApiValidate200Response,
    },
  },
} as const;
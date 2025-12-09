import type { z } from "zod";

/**
 * Base tagged error with optional codes
 *
 * @template TData - The error data type
 */
export interface TaggedError<TData> {
  /** General error code */
  _code?: number;
  /** HTTP status code */
  _httpCode?: number;
  /** The error data */
  data: TData;
}

/**
 * Infer error union from HTTP error schemas (Record<number, ZodSchema>)
 * Each error is tagged with its HTTP status code
 *
 * @example
 * ```typescript
 * const errors = {
 *   404: z.object({ message: z.string() }),
 *   401: z.object({ reason: z.string() }),
 * };
 *
 * type Errors = InferHttpErrors<typeof errors>;
 * // { _httpCode: 404; data: { message: string } }
 * // | { _httpCode: 401; data: { reason: string } }
 * ```
 */
export type InferHttpErrors<T extends Record<number, z.ZodTypeAny>> = {
  [K in keyof T]: K extends number
    ? {
        _code?: number;
        _httpCode: K;
        data: z.infer<T[K]>;
      }
    : never;
}[keyof T];

/**
 * Infer error union from message error schemas (Record<string, ZodSchema>)
 * Used for Kafka and Workers which use string error codes
 *
 * @example
 * ```typescript
 * const errors = {
 *   INVALID_PAYLOAD: z.object({ field: z.string() }),
 *   NOT_FOUND: z.object({ id: z.string() }),
 * };
 *
 * type Errors = InferMessageErrors<typeof errors>;
 * // TaggedError<{ field: string }> | TaggedError<{ id: string }>
 * ```
 */
export type InferMessageErrors<T extends Record<string, z.ZodTypeAny>> = {
  [K in keyof T]: TaggedError<z.infer<T[K]>>;
}[keyof T];

/**
 * Helper to create an HTTP error with proper typing
 *
 * @example
 * ```typescript
 * return err(httpError(404, { message: "User not found" }));
 * ```
 */
export function httpError<TCode extends number, TData>(
  httpCode: TCode,
  data: TData,
): { _httpCode: TCode; data: TData } {
  return { _httpCode: httpCode, data };
}

/**
 * Helper to create an error with both codes
 *
 * @example
 * ```typescript
 * return err(taggedError(1001, 400, { message: "Validation failed" }));
 * ```
 */
export function taggedError<TCode extends number, THttpCode extends number, TData>(
  code: TCode,
  httpCode: THttpCode,
  data: TData,
): { _code: TCode; _httpCode: THttpCode; data: TData } {
  return { _code: code, _httpCode: httpCode, data };
}

import type { z } from "zod";
import type { Result, ResultError } from "@alt-stack/result";

export type InferOutput<T extends z.ZodTypeAny> = z.infer<T>;

export type InferErrorSchemas<T extends Record<number, z.ZodTypeAny | string | string[]>> = {
  [K in keyof T]: z.infer<T[K]>;
};

export type ErrorUnion<T extends Record<number, z.ZodTypeAny | string | string[]>> =
  InferErrorSchemas<T>[keyof InferErrorSchemas<T>];

/**
 * Infer the Result type for a handler based on errors and output schemas.
 * When no output schema is defined, allows any value including Response objects.
 *
 * Errors must extend ResultError (Error with _tag property).
 * The TErrors record maps HTTP status codes to error tag strings or arrays of tag strings.
 *
 * @example
 * ```typescript
 * class NotFoundError extends Error {
 *   readonly _tag = "NotFoundError" as const;
 *   constructor(public readonly id: string) {
 *     super(`Resource ${id} not found`);
 *     this.name = "NotFoundError";
 *   }
 * }
 *
 * // In handler:
 * .errors({ 404: "NotFoundError" })
 * .handler((opts) => {
 *   if (!found) return err(new NotFoundError(id));
 *   return ok(data);
 * })
 * ```
 */
export type HandlerResult<
  TErrors extends Record<number, z.ZodTypeAny | string | string[]> | undefined,
  TOutput extends z.ZodTypeAny | undefined,
> = Result<TOutput extends z.ZodTypeAny ? InferOutput<TOutput> : unknown, ResultError>;

// ============================================================================
// String Input Validation Types
// ============================================================================
// These types ensure params/query schemas only accept string-compatible input,
// since HTTP parameters are always strings. Supports:
// - z.string() and variants
// - z.coerce.* (accepts unknown, including strings)
// - z.string().transform(...) for codecs
// - z.enum([...]) with string literals
// - z.optional(...) wrapping valid types

/**
 * Check if a field type can accept string input:
 * 1. Field type extends string (e.g., "a" | "b" is a subset of string) - enum literals
 * 2. string extends field type (e.g., string extends unknown) - coerce types
 * 3. For optional fields, check the non-undefined part
 */
type FieldAcceptsString<T> = T extends string
  ? true
  : string extends T
    ? true
    : undefined extends T
      ? FieldAcceptsString<Exclude<T, undefined>>
      : false;

/** Check if all fields in a record type accept string input */
type AllFieldsAcceptString<T extends Record<string, unknown>> = keyof T extends never
  ? true
  : false extends { [K in keyof T]: FieldAcceptsString<T[K]> }[keyof T]
    ? false
    : true;

/**
 * Validates that an object schema's input type only contains string-compatible fields.
 * Returns T if valid, never if any field doesn't accept string input.
 */
export type StringInputObjectSchema<T extends z.ZodTypeAny> =
  z.input<T> extends Record<string, unknown>
    ? AllFieldsAcceptString<z.input<T>> extends true
      ? T
      : never
    : never;

export interface InputConfig {
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
}

export type InferInput<T extends InputConfig> = {
  params: T extends { params: infer P }
    ? P extends z.ZodTypeAny
      ? z.infer<P>
      : undefined
    : undefined;
  query: T extends { query: infer Q }
    ? Q extends z.ZodTypeAny
      ? z.infer<Q>
      : undefined
    : undefined;
  body: T extends { body: infer B } ? (B extends z.ZodTypeAny ? z.infer<B> : undefined) : undefined;
};

/**
 * Base context interface - framework adapters extend this with their own context.
 */
export interface BaseContext {
  /** Current OpenTelemetry span (undefined if telemetry disabled or not installed) */
  span?: import("@opentelemetry/api").Span;
}

export type TypedContext<
  TInput extends InputConfig,
  TErrors extends Record<number, z.ZodTypeAny | string | string[]> | undefined,
  TCustomContext extends object = Record<string, never>,
> = BaseContext &
  TCustomContext & {
    input: InferInput<TInput>;
  };


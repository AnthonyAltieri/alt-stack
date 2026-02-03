import type { z } from "zod";
import type { Result, ResultError } from "@alt-stack/result";

export type InferOutput<T extends z.ZodTypeAny> = z.infer<T>;

// ============================================================================
// Error Schema Types
// ============================================================================

/**
 * Error config value - must be a Zod schema with a `_tag: z.literal("...")` field.
 * The schema shape must be a subset of the actual error class properties.
 */
export type ErrorSchemaValue = z.ZodTypeAny;

/**
 * Extract the _tag literal type from a Zod schema.
 * Works with z.object({ _tag: z.literal("...") }) and z.union([...])
 *
 * @example
 * ExtractTagFromSchema<z.object({ _tag: z.literal("NotFound") }>> = "NotFound"
 * ExtractTagFromSchema<z.union([
 *   z.object({ _tag: z.literal("A") }),
 *   z.object({ _tag: z.literal("B") })
 * ]>> = "A" | "B"
 */
export type ExtractTagFromSchema<T extends z.ZodTypeAny> =
  z.infer<T> extends { _tag: infer Tag }
    ? Tag extends string
      ? Tag
      : never
    : never;

/**
 * Extract all _tag literals from an error config record.
 * Maps each status code's schema to its _tag literal(s).
 *
 * @example
 * ExtractErrorTags<{
 *   404: z.object({ _tag: z.literal("NotFound") }),
 *   500: z.union([z.object({ _tag: z.literal("DbError") }), z.object({ _tag: z.literal("Random") })])
 * }> = "NotFound" | "DbError" | "Random"
 */
export type ExtractErrorTags<T extends Record<number, z.ZodTypeAny>> = {
  [K in keyof T]: T[K] extends z.ZodTypeAny ? ExtractTagFromSchema<T[K]> : never;
}[keyof T];

/**
 * Constrain ResultError to only allow specific _tag values.
 */
export type TaggedResultError<Tags extends string> = ResultError & { readonly _tag: Tags };

/**
 * Validate that a Zod schema is a valid subset of an error type.
 * The error must be assignable to the schema's inferred type.
 * This ensures the schema only includes fields that exist on the error.
 *
 * @example
 * class MyError extends TaggedError {
 *   readonly _tag = "MyError";
 *   constructor(public readonly id: string) { super(); }
 * }
 *
 * // ✅ Valid - MyError has { _tag, id, ... }
 * ValidateErrorSchema<z.object({ _tag: z.literal("MyError"), id: z.string() }>, MyError>
 *
 * // ❌ Invalid - MyError doesn't have 'foobar'
 * ValidateErrorSchema<z.object({ _tag: z.literal("MyError"), foobar: z.number() }>, MyError>
 */
export type ValidateErrorSchema<
  TSchema extends z.ZodTypeAny,
  TError extends ResultError,
> = TError extends z.infer<TSchema> ? TSchema : never;

export type InferErrorSchemas<T extends Record<number, z.ZodTypeAny>> = {
  [K in keyof T]: z.infer<T[K]>;
};

export type ErrorUnion<T extends Record<number, z.ZodTypeAny>> =
  InferErrorSchemas<T>[keyof InferErrorSchemas<T>];

/**
 * Validates that a Zod schema has a `_tag` field with a literal type (not just `string`).
 * Returns the schema type if valid, `never` if missing `_tag` or `_tag` is not a literal.
 *
 * @example
 * // ✅ Valid - has _tag literal
 * HasTagLiteral<z.object({ _tag: z.literal("NotFound"), message: z.string() }>>
 *   => z.ZodObject<...>
 *
 * // ❌ Invalid - missing _tag
 * HasTagLiteral<z.object({ message: z.string() }>>
 *   => never
 *
 * // ❌ Invalid - _tag is string, not literal
 * HasTagLiteral<z.object({ _tag: z.string(), message: z.string() }>>
 *   => never
 */
export type HasTagLiteral<T extends z.ZodTypeAny> =
  z.infer<T> extends { _tag: infer Tag }
    ? Tag extends string
      ? string extends Tag // Reject if Tag is just `string`, not a literal
        ? never
        : T
      : never
    : never;

/**
 * Validates all schemas in an error config have `_tag: z.literal("...")`.
 * Maps each status code's schema through HasTagLiteral validation.
 *
 * Used with intersection type to enforce _tag literals at compile time:
 * ```typescript
 * errors<TErrors extends Record<number, z.ZodTypeAny>>(
 *   errors: TErrors & ValidateErrorConfig<TErrors>,
 * )
 * ```
 *
 * When a schema is missing `_tag` literal, that property becomes `never`,
 * causing a type mismatch and compile error.
 */
export type ValidateErrorConfig<T extends Record<number, z.ZodTypeAny>> = {
  [K in keyof T]: T[K] extends z.ZodTypeAny ? HasTagLiteral<T[K]> : never;
};

/**
 * Infer the Result type for a handler based on errors and output schemas.
 * When no output schema is defined, allows any value including Response objects.
 *
 * Errors are constrained to only those with _tag values matching the declared error schemas.
 * Each error schema must be a Zod object with `_tag: z.literal("...")`.
 *
 * @example
 * ```typescript
 * class NotFoundError extends TaggedError {
 *   readonly _tag = "NotFoundError";
 *   constructor(public readonly resourceId: string) {
 *     super(`Resource ${resourceId} not found`);
 *   }
 * }
 *
 * // In handler - error schema documents the API response shape:
 * .errors({
 *   404: z.object({
 *     _tag: z.literal("NotFoundError"),
 *     resourceId: z.string(),
 *   })
 * })
 * .handler((opts) => {
 *   if (!found) return err(new NotFoundError(id)); // ✅ Allowed
 *   return err(new OtherError()); // ❌ TypeScript error - not declared
 * })
 * ```
 */
export type HandlerResult<
  TErrors extends Record<number, z.ZodTypeAny> | undefined,
  TOutput extends z.ZodTypeAny | undefined,
> =
  | Result<
      TOutput extends z.ZodTypeAny ? InferOutput<TOutput> : unknown,
      TErrors extends Record<number, z.ZodTypeAny>
        ? TaggedResultError<ExtractErrorTags<TErrors>>
        : ResultError
    >
  | (TOutput extends z.ZodTypeAny ? InferOutput<TOutput> : unknown);

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
  _TErrors extends Record<number, z.ZodTypeAny> | undefined,
  TCustomContext extends object = Record<string, never>,
> = BaseContext &
  TCustomContext & {
    input: InferInput<TInput>;
  };

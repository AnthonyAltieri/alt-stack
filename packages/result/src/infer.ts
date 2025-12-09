import type { ResultError } from "./result.js";

/**
 * Helper type to extract the _tag literal type from an error class
 *
 * @example
 * ```typescript
 * class NotFoundError extends Error {
 *   readonly _tag = "NotFoundError" as const;
 * }
 * type Tag = InferErrorTag<NotFoundError>; // "NotFoundError"
 * ```
 */
export type InferErrorTag<E extends ResultError> = E["_tag"];

/**
 * Helper type to extract all possible _tag values from an error union
 *
 * @example
 * ```typescript
 * type Tags = InferErrorTags<NotFoundError | ValidationError>;
 * // "NotFoundError" | "ValidationError"
 * ```
 */
export type InferErrorTags<E extends ResultError> = E extends ResultError
  ? E["_tag"]
  : never;

/**
 * Helper type to narrow an error union by its _tag
 *
 * @example
 * ```typescript
 * type MyError = NotFoundError | ValidationError;
 * type Narrowed = NarrowError<MyError, "NotFoundError">; // NotFoundError
 * ```
 */
export type NarrowError<
  E extends ResultError,
  Tag extends string,
> = E extends { _tag: Tag } ? E : never;

/**
 * Check if an unknown value is a valid ResultError
 *
 * @example
 * ```typescript
 * try {
 *   // ... some code that throws
 * } catch (e) {
 *   if (isResultError(e)) {
 *     return err(e);
 *   }
 *   return err(new UnknownError(e));
 * }
 * ```
 */
export function isResultError(error: unknown): error is ResultError {
  return error instanceof Error && typeof (error as any)._tag === "string";
}

/**
 * Runtime assertion that an error is a valid ResultError
 * Throws TypeError if the error doesn't meet the ResultError constraint.
 *
 * @example
 * ```typescript
 * try {
 *   // ... some code that throws
 * } catch (e) {
 *   assertResultError(e); // throws if not a ResultError
 *   return err(e);
 * }
 * ```
 */
export function assertResultError(
  error: unknown,
): asserts error is ResultError {
  if (!(error instanceof Error)) {
    throw new TypeError("Error must be an instance of Error");
  }
  if (typeof (error as any)._tag !== "string") {
    throw new TypeError("Error must have a readonly _tag string property");
  }
}

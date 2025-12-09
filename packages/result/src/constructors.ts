import type { Ok, Err, ResultError } from "./result.js";

/**
 * Create a success Result
 *
 * @example
 * ```typescript
 * const result = ok({ id: 1, name: "Alice" });
 * // Result<{ id: number; name: string }, never>
 * ```
 *
 * @example
 * ```typescript
 * const result = ok();
 * // Result<void, never>
 * ```
 */
export function ok(): Ok<void>;
export function ok<A>(value: A): Ok<A>;
export function ok<A>(value?: A): Ok<A> {
  return { _tag: "Ok", value: value as A };
}

/**
 * Create a failure Result
 *
 * The error must extend Error and have a readonly _tag property for
 * type-safe exhaustive error handling.
 *
 * @example
 * ```typescript
 * class ValidationError extends Error {
 *   readonly _tag = "ValidationError" as const;
 *   constructor(public readonly field: string, message: string) {
 *     super(message);
 *     this.name = "ValidationError";
 *   }
 * }
 *
 * return err(new ValidationError("email", "Invalid email format"));
 * ```
 */
export function err<E extends ResultError>(error: E): Err<E> {
  return { _tag: "Err", error };
}

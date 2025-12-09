import type { Result, ResultError } from "./result.js";
import { isOk } from "./guards.js";

/**
 * Extract value or throw error
 *
 * Since errors are now proper Error instances, this will throw
 * the actual Error with full stack trace.
 *
 * @throws The error if Result is Err
 *
 * @example
 * ```typescript
 * const result = ok(42);
 * const value = unwrap(result); // 42
 *
 * class MyError extends Error {
 *   readonly _tag = "MyError" as const;
 *   constructor(message: string) {
 *     super(message);
 *     this.name = "MyError";
 *   }
 * }
 *
 * const errorResult = err(new MyError("failed"));
 * unwrap(errorResult); // throws MyError with stack trace
 * ```
 */
export function unwrap<A, E extends ResultError>(result: Result<A, E>): A {
  if (isOk(result)) {
    return result.value;
  }
  throw result.error;
}

/**
 * Extract value or use default
 *
 * @example
 * ```typescript
 * const result = err(new MyError("failed"));
 * const value = unwrapOr(result, 0); // 0
 * ```
 */
export function unwrapOr<A, E extends ResultError>(
  result: Result<A, E>,
  defaultValue: A,
): A {
  if (isOk(result)) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Extract value or compute default from error
 *
 * @example
 * ```typescript
 * class NotFoundError extends Error {
 *   readonly _tag = "NotFoundError" as const;
 *   constructor(public readonly id: string) {
 *     super(`Not found: ${id}`);
 *     this.name = "NotFoundError";
 *   }
 * }
 *
 * const result = err(new NotFoundError("123"));
 * const value = unwrapOrElse(result, e => `Error for ${e.id}`);
 * // "Error for 123"
 * ```
 */
export function unwrapOrElse<A, E extends ResultError>(
  result: Result<A, E>,
  fn: (error: E) => A,
): A {
  if (isOk(result)) {
    return result.value;
  }
  return fn(result.error);
}

/**
 * Get the value if Ok, undefined otherwise
 *
 * @example
 * ```typescript
 * const result = err(new MyError("failed"));
 * const value = getOrUndefined(result); // undefined
 * ```
 */
export function getOrUndefined<A, E extends ResultError>(
  result: Result<A, E>,
): A | undefined {
  if (isOk(result)) {
    return result.value;
  }
  return undefined;
}

/**
 * Get the error if Err, undefined otherwise
 *
 * @example
 * ```typescript
 * class MyError extends Error {
 *   readonly _tag = "MyError" as const;
 *   constructor(message: string) {
 *     super(message);
 *     this.name = "MyError";
 *   }
 * }
 *
 * const result = err(new MyError("failed"));
 * const error = getErrorOrUndefined(result);
 * // MyError { _tag: "MyError", message: "failed" }
 * ```
 */
export function getErrorOrUndefined<A, E extends ResultError>(
  result: Result<A, E>,
): E | undefined {
  if (isOk(result)) {
    return undefined;
  }
  return result.error;
}

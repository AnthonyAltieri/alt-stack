import type { Result } from "./result.js";
import { isOk } from "./guards.js";

/**
 * Extract value or throw error
 *
 * @throws The error if Result is Err
 *
 * @example
 * ```typescript
 * const result = ok(42);
 * const value = unwrap(result); // 42
 *
 * const errorResult = err("failed");
 * unwrap(errorResult); // throws "failed"
 * ```
 */
export function unwrap<A, E>(result: Result<A, E>): A {
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
 * const result = err("failed");
 * const value = unwrapOr(result, 0); // 0
 * ```
 */
export function unwrapOr<A, E>(result: Result<A, E>, defaultValue: A): A {
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
 * const result = err({ code: 404 });
 * const value = unwrapOrElse(result, e => `Error: ${e.code}`);
 * // "Error: 404"
 * ```
 */
export function unwrapOrElse<A, E>(result: Result<A, E>, fn: (error: E) => A): A {
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
 * const result = err("failed");
 * const value = getOrUndefined(result); // undefined
 * ```
 */
export function getOrUndefined<A, E>(result: Result<A, E>): A | undefined {
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
 * const result = err("failed");
 * const error = getErrorOrUndefined(result); // "failed"
 * ```
 */
export function getErrorOrUndefined<A, E>(result: Result<A, E>): E | undefined {
  if (isOk(result)) {
    return undefined;
  }
  return result.error;
}

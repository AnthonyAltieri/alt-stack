import type { Result } from "./result.js";
import { ok, err } from "./constructors.js";
import { isOk } from "./guards.js";

/**
 * Transform the success value
 *
 * @example
 * ```typescript
 * const result = ok(5);
 * const doubled = map(result, x => x * 2);
 * // Ok { value: 10 }
 * ```
 */
export function map<A, E, B>(result: Result<A, E>, fn: (a: A) => B): Result<B, E> {
  if (isOk(result)) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Chain Results (flatMap/bind)
 *
 * @example
 * ```typescript
 * const result = ok(5);
 * const chained = flatMap(result, x =>
 *   x > 0 ? ok(x * 2) : err("Must be positive")
 * );
 * // Ok { value: 10 }
 * ```
 */
export function flatMap<A, E, B, E2>(
  result: Result<A, E>,
  fn: (a: A) => Result<B, E2>,
): Result<B, E | E2> {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
}

/**
 * Transform the error value
 *
 * @example
 * ```typescript
 * const result = err("error");
 * const mapped = mapError(result, e => ({ message: e }));
 * // Err { error: { message: "error" } }
 * ```
 */
export function mapError<A, E, E2>(result: Result<A, E>, fn: (e: E) => E2): Result<A, E2> {
  if (isOk(result)) {
    return result;
  }
  return err(fn(result.error));
}

/**
 * Recover from an error by trying an alternative
 *
 * @example
 * ```typescript
 * const result = err("not found");
 * const recovered = catchError(result, e => ok("default"));
 * // Ok { value: "default" }
 * ```
 */
export function catchError<A, E, B, E2>(
  result: Result<A, E>,
  fn: (e: E) => Result<B, E2>,
): Result<A | B, E2> {
  if (isOk(result)) {
    return result;
  }
  return fn(result.error);
}

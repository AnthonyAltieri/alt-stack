import type { Result } from "./result.js";
import { isOk } from "./guards.js";

/**
 * Pattern match on Result
 *
 * @example
 * ```typescript
 * const result = ok(42);
 * const message = match(result, {
 *   ok: value => `Success: ${value}`,
 *   err: error => `Error: ${error}`,
 * });
 * // "Success: 42"
 * ```
 */
export function match<A, E, B, C = B>(
  result: Result<A, E>,
  handlers: {
    ok: (value: A) => B;
    err: (error: E) => C;
  },
): B | C {
  if (isOk(result)) {
    return handlers.ok(result.value);
  }
  return handlers.err(result.error);
}

/**
 * Fold/reduce a Result to a single value
 *
 * @example
 * ```typescript
 * const result = err("not found");
 * const status = fold(
 *   result,
 *   error => 404,
 *   value => 200,
 * );
 * // 404
 * ```
 */
export function fold<A, E, B>(
  result: Result<A, E>,
  onErr: (error: E) => B,
  onOk: (value: A) => B,
): B {
  if (isOk(result)) {
    return onOk(result.value);
  }
  return onErr(result.error);
}

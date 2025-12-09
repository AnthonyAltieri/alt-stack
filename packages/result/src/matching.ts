import type { Result, ResultError } from "./result.js";
import { isOk } from "./guards.js";

/**
 * Pattern match on Result
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
 * const result = ok(42);
 * const message = match(result, {
 *   ok: value => `Success: ${value}`,
 *   err: error => `Error: ${error._tag}`,
 * });
 * // "Success: 42"
 * ```
 */
export function match<A, E extends ResultError, B, C = B>(
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
 * class NotFoundError extends Error {
 *   readonly _tag = "NotFoundError" as const;
 *   constructor() {
 *     super("Not found");
 *     this.name = "NotFoundError";
 *   }
 * }
 *
 * const result = err(new NotFoundError());
 * const status = fold(
 *   result,
 *   error => 404,
 *   value => 200,
 * );
 * // 404
 * ```
 */
export function fold<A, E extends ResultError, B>(
  result: Result<A, E>,
  onErr: (error: E) => B,
  onOk: (value: A) => B,
): B {
  if (isOk(result)) {
    return onOk(result.value);
  }
  return onErr(result.error);
}

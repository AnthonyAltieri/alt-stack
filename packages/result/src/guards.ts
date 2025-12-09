import type { Result, Ok, Err } from "./result.js";

/**
 * Type guard for Ok
 *
 * @example
 * ```typescript
 * const result = ok(42);
 * if (isOk(result)) {
 *   console.log(result.value); // 42
 * }
 * ```
 */
export function isOk<A, E>(result: Result<A, E>): result is Ok<A> {
  return result._tag === "Ok";
}

/**
 * Type guard for Err
 *
 * @example
 * ```typescript
 * const result = err({ message: "Failed" });
 * if (isErr(result)) {
 *   console.log(result.error); // { message: "Failed" }
 * }
 * ```
 */
export function isErr<A, E>(result: Result<A, E>): result is Err<E> {
  return result._tag === "Err";
}

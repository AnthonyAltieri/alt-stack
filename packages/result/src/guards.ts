import type { Result, Ok, Err, ResultError } from "./result.js";
import { isResultError } from "./infer.js";
import { hasResultBrand } from "./marker.js";

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
export function isOk<A, E extends ResultError>(
  result: Result<A, E>,
): result is Ok<A> {
  return result._tag === "Ok";
}

/**
 * Type guard for Err
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
 * const result = err(new MyError("Failed"));
 * if (isErr(result)) {
 *   console.log(result.error._tag); // "MyError"
 *   console.log(result.error.message); // "Failed"
 * }
 * ```
 */
export function isErr<A, E extends ResultError>(
  result: Result<A, E>,
): result is Err<E> {
  return result._tag === "Err";
}

/**
 * Type guard for Result
 *
 * @example
 * ```typescript
 * const value: unknown = ok(42);
 * if (isResult(value)) {
 *   console.log(value._tag); // "Ok"
 * }
 * ```
 */
export function isResult(
  value: unknown,
): value is Result<unknown, ResultError> {
  if (!hasResultBrand(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (!("_tag" in candidate)) return false;
  const tag = candidate._tag;
  if (tag === "Ok") return "value" in candidate;
  if (tag === "Err") {
    return "error" in candidate && isResultError(candidate.error);
  }
  return false;
}

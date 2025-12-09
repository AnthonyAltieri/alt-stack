import type { Result } from "./result.js";
import { ok, err } from "./constructors.js";
import { isOk, isErr } from "./guards.js";

/**
 * Helper types for all() function
 */
type ResultValues<T extends readonly Result<unknown, unknown>[]> = {
  -readonly [K in keyof T]: T[K] extends Result<infer A, unknown> ? A : never;
};

type ResultErrors<T extends readonly Result<unknown, unknown>[]> = {
  [K in keyof T]: T[K] extends Result<unknown, infer E> ? E : never;
}[number];

/**
 * Combine multiple Results into one
 * Returns Err with first error encountered, or Ok with array of all values
 *
 * @example
 * ```typescript
 * const results = all([ok(1), ok(2), ok(3)]);
 * // Ok { value: [1, 2, 3] }
 *
 * const withError = all([ok(1), err("failed"), ok(3)]);
 * // Err { error: "failed" }
 * ```
 */
export function all<T extends readonly Result<unknown, unknown>[]>(
  results: [...T],
): Result<ResultValues<T>, ResultErrors<T>> {
  const values: unknown[] = [];

  for (const result of results) {
    if (isErr(result)) {
      return result as Result<ResultValues<T>, ResultErrors<T>>;
    }
    values.push(result.value);
  }

  return ok(values as ResultValues<T>);
}

/**
 * Return first Ok or collect all Errors
 *
 * @example
 * ```typescript
 * const result = firstOk([err("a"), ok(1), err("b")]);
 * // Ok { value: 1 }
 *
 * const allFailed = firstOk([err("a"), err("b")]);
 * // Err { error: ["a", "b"] }
 * ```
 */
export function firstOk<A, E>(results: Result<A, E>[]): Result<A, E[]> {
  const errors: E[] = [];

  for (const result of results) {
    if (isOk(result)) {
      return result;
    }
    errors.push(result.error);
  }

  return err(errors);
}

/**
 * Run function for side effects on Ok value
 *
 * @example
 * ```typescript
 * const result = tap(ok(42), value => console.log("Got:", value));
 * // Logs: "Got: 42"
 * // Returns: Ok { value: 42 }
 * ```
 */
export function tap<A, E>(result: Result<A, E>, fn: (value: A) => void): Result<A, E> {
  if (isOk(result)) {
    fn(result.value);
  }
  return result;
}

/**
 * Run function for side effects on Err
 *
 * @example
 * ```typescript
 * const result = tapError(err("failed"), error => console.error(error));
 * // Logs: "failed"
 * // Returns: Err { error: "failed" }
 * ```
 */
export function tapError<A, E>(result: Result<A, E>, fn: (error: E) => void): Result<A, E> {
  if (isErr(result)) {
    fn(result.error);
  }
  return result;
}

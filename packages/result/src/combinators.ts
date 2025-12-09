import type { Result, ResultError } from "./result.js";
import { ok, err } from "./constructors.js";
import { isOk, isErr } from "./guards.js";

/**
 * Helper types for all() function
 */
type ResultValues<T extends readonly Result<unknown, ResultError>[]> = {
  -readonly [K in keyof T]: T[K] extends Result<infer A, ResultError>
    ? A
    : never;
};

type ResultErrors<T extends readonly Result<unknown, ResultError>[]> = {
  [K in keyof T]: T[K] extends Result<unknown, infer E extends ResultError>
    ? E
    : never;
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
 * const withError = all([ok(1), err(new MyError("failed")), ok(3)]);
 * // Err { error: MyError }
 * ```
 */
export function all<T extends readonly Result<unknown, ResultError>[]>(
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
 * AggregateError for firstOk combinator
 * Collects all errors when no Result succeeds
 */
export class ResultAggregateError extends Error {
  readonly _tag = "ResultAggregateError" as const;

  constructor(public readonly errors: ResultError[]) {
    const messages = errors.map((e) => e.message).join(", ");
    super(`All results failed: ${messages}`);
    this.name = "ResultAggregateError";
  }
}

/**
 * Return first Ok or collect all Errors into an AggregateError
 *
 * @example
 * ```typescript
 * const result = firstOk([err(new ErrorA()), ok(1), err(new ErrorB())]);
 * // Ok { value: 1 }
 *
 * const allFailed = firstOk([err(new ErrorA()), err(new ErrorB())]);
 * // Err { error: ResultAggregateError { errors: [ErrorA, ErrorB] } }
 * ```
 */
export function firstOk<A, E extends ResultError>(
  results: Result<A, E>[],
): Result<A, ResultAggregateError> {
  const errors: E[] = [];

  for (const result of results) {
    if (isOk(result)) {
      return result;
    }
    errors.push(result.error);
  }

  return err(new ResultAggregateError(errors));
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
export function tap<A, E extends ResultError>(
  result: Result<A, E>,
  fn: (value: A) => void,
): Result<A, E> {
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
 * class MyError extends Error {
 *   readonly _tag = "MyError" as const;
 *   constructor(message: string) {
 *     super(message);
 *     this.name = "MyError";
 *   }
 * }
 *
 * const result = tapError(err(new MyError("failed")), error => console.error(error._tag));
 * // Logs: "MyError"
 * // Returns: Err { error: MyError }
 * ```
 */
export function tapError<A, E extends ResultError>(
  result: Result<A, E>,
  fn: (error: E) => void,
): Result<A, E> {
  if (isErr(result)) {
    fn(result.error);
  }
  return result;
}

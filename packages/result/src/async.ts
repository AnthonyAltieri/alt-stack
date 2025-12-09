import type { Result, ResultError } from "./result.js";
import { ok, err } from "./constructors.js";

/**
 * ResultAsync - Promise wrapper for Result
 */
export type ResultAsync<A, E extends ResultError> = Promise<Result<A, E>>;

/**
 * Wrap a promise in a Result (catches rejections)
 *
 * The onReject function MUST return a valid ResultError instance.
 *
 * @example
 * ```typescript
 * class FetchError extends Error {
 *   readonly _tag = "FetchError" as const;
 *   constructor(public readonly originalError: unknown) {
 *     super(`Fetch failed: ${String(originalError)}`);
 *     this.name = "FetchError";
 *   }
 * }
 *
 * const result = await fromPromise(
 *   fetch("/api/user"),
 *   error => new FetchError(error)
 * );
 * ```
 */
export async function fromPromise<A, E extends ResultError>(
  promise: Promise<A>,
  onReject: (error: unknown) => E,
): ResultAsync<A, E> {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    return err(onReject(error));
  }
}

/**
 * Try a synchronous function and wrap in Result
 *
 * The onError function MUST return a valid ResultError instance.
 *
 * @example
 * ```typescript
 * class ParseError extends Error {
 *   readonly _tag = "ParseError" as const;
 *   constructor(public readonly originalError: unknown) {
 *     super(`Parse failed: ${String(originalError)}`);
 *     this.name = "ParseError";
 *   }
 * }
 *
 * const result = tryCatch(
 *   () => JSON.parse(input),
 *   error => new ParseError(error)
 * );
 * ```
 */
export function tryCatch<A, E extends ResultError>(
  fn: () => A,
  onError: (error: unknown) => E,
): Result<A, E> {
  try {
    return ok(fn());
  } catch (error) {
    return err(onError(error));
  }
}

/**
 * Async version of tryCatch
 *
 * The onError function MUST return a valid ResultError instance.
 *
 * @example
 * ```typescript
 * class RequestError extends Error {
 *   readonly _tag = "RequestError" as const;
 *   constructor(public readonly originalError: unknown) {
 *     super(`Request failed: ${String(originalError)}`);
 *     this.name = "RequestError";
 *   }
 * }
 *
 * const result = await tryCatchAsync(
 *   async () => {
 *     const response = await fetch("/api/data");
 *     return response.json();
 *   },
 *   error => new RequestError(error)
 * );
 * ```
 */
export async function tryCatchAsync<A, E extends ResultError>(
  fn: () => Promise<A>,
  onError: (error: unknown) => E,
): ResultAsync<A, E> {
  try {
    const value = await fn();
    return ok(value);
  } catch (error) {
    return err(onError(error));
  }
}

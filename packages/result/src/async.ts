import type { Result } from "./result.js";
import { ok, err } from "./constructors.js";

/**
 * ResultAsync - Promise wrapper for Result
 */
export type ResultAsync<A, E> = Promise<Result<A, E>>;

/**
 * Wrap a promise in a Result (catches rejections)
 *
 * @example
 * ```typescript
 * const result = await fromPromise(
 *   fetch("/api/user"),
 *   error => ({ _httpCode: 500, data: { message: String(error) } })
 * );
 * ```
 */
export async function fromPromise<A, E>(
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
 * @example
 * ```typescript
 * const result = tryCatch(
 *   () => JSON.parse(input),
 *   error => ({ message: "Invalid JSON" })
 * );
 * ```
 */
export function tryCatch<A, E>(fn: () => A, onError: (error: unknown) => E): Result<A, E> {
  try {
    return ok(fn());
  } catch (error) {
    return err(onError(error));
  }
}

/**
 * Async version of tryCatch
 *
 * @example
 * ```typescript
 * const result = await tryCatchAsync(
 *   async () => {
 *     const response = await fetch("/api/data");
 *     return response.json();
 *   },
 *   error => ({ _httpCode: 500, data: { message: "Request failed" } })
 * );
 * ```
 */
export async function tryCatchAsync<A, E>(
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

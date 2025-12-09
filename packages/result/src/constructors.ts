import type { Ok, Err } from "./result.js";

/**
 * Create a success Result
 *
 * @example
 * ```typescript
 * const result = ok({ id: 1, name: "Alice" });
 * // Result<never, { id: number; name: string }>
 * ```
 */
export function ok<A>(value: A): Ok<A> {
  return { _tag: "Ok", value };
}

/**
 * Create a failure Result
 *
 * @example
 * ```typescript
 * const result = err({ _httpCode: 404, data: { message: "Not found" } });
 * // Result<{ _httpCode: 404; data: { message: string } }, never>
 * ```
 */
export function err<E>(error: E): Err<E> {
  return { _tag: "Err", error };
}

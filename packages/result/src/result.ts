/**
 * Success case - contains the success value
 */
export interface Ok<A> {
  readonly _tag: "Ok";
  readonly value: A;
}

/**
 * Failure case - contains the error value
 */
export interface Err<E> {
  readonly _tag: "Err";
  readonly error: E;
}

/**
 * Result type - a discriminated union of success and failure
 *
 * @template A - The success value type
 * @template E - The error type(s) that can occur (defaults to never)
 *
 * @example
 * ```typescript
 * type GetUserResult = Result<User, UserNotFound | DatabaseError>;
 * ```
 */
export type Result<A, E = never> = Ok<A> | Err<E>;

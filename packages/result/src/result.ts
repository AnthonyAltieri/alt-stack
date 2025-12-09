/**
 * Base constraint for Result errors.
 * Errors MUST extend JavaScript's Error class AND have a readonly _tag property.
 * The _tag should be a string literal type for exhaustive switch support.
 *
 * @example
 * ```typescript
 * class NotFoundError extends Error {
 *   readonly _tag = "NotFoundError" as const;
 *   constructor(public readonly database: string, public readonly resourceId: string) {
 *     super(`Resource ${resourceId} not found in ${database}`);
 *     this.name = "NotFoundError";
 *   }
 * }
 * ```
 */
export type ResultError = Error & { readonly _tag: string };

/**
 * Success case - contains the success value
 */
export interface Ok<A> {
  readonly _tag: "Ok";
  readonly value: A;
}

/**
 * Failure case - contains the error value
 * E is constrained to extend ResultError
 */
export interface Err<E extends ResultError> {
  readonly _tag: "Err";
  readonly error: E;
}

/**
 * Result type - a discriminated union of success and failure
 *
 * @template A - The success value type
 * @template E - The error type(s) that can occur (must extend ResultError)
 *
 * @example
 * ```typescript
 * class NotFoundError extends Error {
 *   readonly _tag = "NotFoundError" as const;
 *   constructor(public readonly id: string) {
 *     super(`Resource ${id} not found`);
 *     this.name = "NotFoundError";
 *   }
 * }
 *
 * class DatabaseError extends Error {
 *   readonly _tag = "DatabaseError" as const;
 *   constructor(message: string) {
 *     super(message);
 *     this.name = "DatabaseError";
 *   }
 * }
 *
 * type GetUserResult = Result<User, NotFoundError | DatabaseError>;
 *
 * // Exhaustive error handling with switch
 * const result = getUser(id);
 * if (isErr(result)) {
 *   switch (result.error._tag) {
 *     case "NotFoundError":
 *       console.log(`User ${result.error.id} not found`);
 *       break;
 *     case "DatabaseError":
 *       console.log(`Database error: ${result.error.message}`);
 *       break;
 *     default:
 *       const _exhaustive: never = result.error;
 *   }
 * }
 * ```
 */
export type Result<A, E extends ResultError = never> = Ok<A> | Err<E>;

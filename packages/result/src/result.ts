/**
 * Type helper to ensure a string is a literal type, not the wider `string` type.
 * This enforces that _tag must be a const string literal.
 */
type StringLiteral<T> = string extends T ? never : T;

/**
 * Base class for Result errors that automatically sets `name` from `_tag`.
 * The `_tag` property must be a const string literal (not just `string`).
 *
 * The type parameter is optional and will be inferred from the `_tag` property value.
 * When provided explicitly, it enforces that `_tag` matches the specified literal type.
 * Subclasses must define `_tag` as a readonly property.
 * The `name` property will automatically return the value of `_tag`.
 *
 * @example
 * ```typescript
 * // Type parameter can be omitted - TypeScript infers from _tag
 * class NotFoundError extends TaggedError {
 *   readonly _tag = "NotFoundError";
 *   constructor(public readonly database: string, public readonly resourceId: string) {
 *     super(`Resource ${resourceId} not found in ${database}`);
 *   }
 * }
 * ```
 */
export abstract class TaggedError<Tag extends string = string> extends Error {
  abstract readonly _tag: [string] extends [Tag] ? string : StringLiteral<Tag>;

  declare name: string;

  constructor(message: string) {
    super(message);
    // Define name as a property with a getter that returns _tag
    // This ensures name always matches _tag without manual assignment
    Object.defineProperty(this, "name", {
      get: () => (this as any)._tag ?? "Error",
      enumerable: false,
      configurable: true,
    });
  }
}

/**
 * Base constraint for Result errors.
 * Errors MUST extend JavaScript's Error class AND have a readonly _tag property.
 * The _tag should be a string literal type for exhaustive switch support.
 *
 * @example
 * ```typescript
 * class NotFoundError extends TaggedError {
 *   readonly _tag = "NotFoundError";
 *   constructor(public readonly database: string, public readonly resourceId: string) {
 *     super(`Resource ${resourceId} not found in ${database}`);
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

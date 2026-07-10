# Result API Documentation

Package: `@alt-stack/result`

All failures are constrained by `ResultError`: an `Error` instance with a string `_tag`. The declared property is readonly, although TypeScript also allows a mutable string property to satisfy that structural constraint. Give `_tag` a readonly literal type (`as const` or an equivalent declaration) when you want precise, exhaustive narrowing.

## Core types

### `Result<A, E>`

```typescript
type Result<A, E extends ResultError = never> = Ok<A> | Err<E>;
```

`A` is the success value and `E` is the union of expected tagged errors. With the default `E = never`, a result cannot contain a representable `Err`.

### `Ok<A>`

| Property | Type | Meaning |
| --- | --- | --- |
| `_tag` | `"Ok"` | outer discriminant |
| `value` | `A` | success value |

Both properties are readonly.

### `Err<E>`

| Property | Type | Meaning |
| --- | --- | --- |
| `_tag` | `"Err"` | outer discriminant |
| `error` | `E` | tagged `Error` instance |

Both properties are readonly.

### `ResultError`

```typescript
type ResultError = Error & { readonly _tag: string };
```

This is the compile-time constraint. Because TypeScript's structural assignability permits a mutable property where a readonly property is expected, neither readonly nor a literal type is required for conformance. At runtime, `isResultError` and `assertResultError` check only that the value is an `Error` and `_tag` is a string.

### `TaggedError<Tag>`

```typescript
abstract class TaggedError<Tag extends string = string> extends Error {
  abstract readonly _tag: [string] extends [Tag]
    ? string
    : StringLiteral<Tag>;
  constructor(message: string);
}
```

`StringLiteral` is an internal, non-exported helper that rejects the wide `string` type. With the default `Tag = string`, the conditional property type resolves to `string`. TypeScript does not infer a superclass type argument from the subclass's `_tag` declaration, so supply the generic explicitly when the base class should enforce one exact tag.

Subclasses provide `_tag`. The base constructor installs a `name` getter that returns `_tag`, or `"Error"` before the subclass field has initialized.

```typescript
class ConflictError extends TaggedError<"ConflictError"> {
  readonly _tag = "ConflictError" as const;

  constructor(readonly key: string) {
    super(`Conflict on ${key}`);
  }
}
```

## Constructors

### `ok`

```typescript
function ok(): Ok<void>;
function ok<A>(value: A): Ok<A>;
```

Creates an `Ok`. Calling it with no argument stores `undefined` as the `void` value.

### `err`

```typescript
function err<E extends ResultError>(error: E): Err<E>;
```

Creates an `Err` without cloning or wrapping `error`.

## Guards

### `isOk`

```typescript
function isOk<A, E extends ResultError>(result: Result<A, E>): result is Ok<A>;
```

Returns whether the outer `_tag` is `"Ok"` and narrows `result`.

### `isErr`

```typescript
function isErr<A, E extends ResultError>(result: Result<A, E>): result is Err<E>;
```

Returns whether the outer `_tag` is `"Err"` and narrows `result`.

## Transformations

### `map`

```typescript
function map<A, E extends ResultError, B>(
  result: Result<A, E>,
  fn: (value: A) => B,
): Result<B, E>;
```

Runs `fn` for `Ok` and passes an `Err` through unchanged. Exceptions thrown by `fn` are not caught.

### `flatMap`

```typescript
function flatMap<A, E extends ResultError, B, E2 extends ResultError>(
  result: Result<A, E>,
  fn: (value: A) => Result<B, E2>,
): Result<B, E | E2>;
```

Chains a result-returning function and unions the original and callback error types. An existing `Err` short-circuits.

### `mapError`

```typescript
function mapError<A, E extends ResultError, E2 extends ResultError>(
  result: Result<A, E>,
  fn: (error: E) => E2,
): Result<A, E2>;
```

Transforms only the error. `fn` must return another `ResultError`.

### `catchError`

```typescript
function catchError<
  A,
  E extends ResultError,
  B,
  E2 extends ResultError,
>(
  result: Result<A, E>,
  fn: (error: E) => Result<B, E2>,
): Result<A | B, E2>;
```

Handles the original `E`. The returned success type includes the original and fallback values; the returned failure type is only the fallback's `E2`.

## Extraction

### `unwrap`

```typescript
function unwrap<A, E extends ResultError>(result: Result<A, E>): A;
```

Returns the `Ok` value. For `Err`, throws the original error instance with its original stack.

### `unwrapOr`

```typescript
function unwrapOr<A, E extends ResultError>(
  result: Result<A, E>,
  defaultValue: A,
): A;
```

Returns `defaultValue` for `Err`.

### `unwrapOrElse`

```typescript
function unwrapOrElse<A, E extends ResultError>(
  result: Result<A, E>,
  fn: (error: E) => A,
): A;
```

Computes a default from the error. `fn` is not called for `Ok`.

### `getOrUndefined`

```typescript
function getOrUndefined<A, E extends ResultError>(
  result: Result<A, E>,
): A | undefined;
```

Returns the success value or `undefined`. It cannot distinguish `ok(undefined)` from an `Err` after extraction.

### `getErrorOrUndefined`

```typescript
function getErrorOrUndefined<A, E extends ResultError>(
  result: Result<A, E>,
): E | undefined;
```

Returns the error or `undefined`.

## Pattern matching

### `match`

```typescript
function match<A, E extends ResultError, B, C = B>(
  result: Result<A, E>,
  handlers: {
    ok: (value: A) => B;
    err: (error: E) => C;
  },
): B | C;
```

Calls exactly one named handler. The handlers may return different types.

### `fold`

```typescript
function fold<A, E extends ResultError, B>(
  result: Result<A, E>,
  onErr: (error: E) => B,
  onOk: (value: A) => B,
): B;
```

Reduces either branch to the same output type. Note the positional order: error handler first, success handler second.

## Async boundaries

### `ResultAsync<A, E>`

```typescript
type ResultAsync<A, E extends ResultError> = Promise<Result<A, E>>;
```

This is a type alias, not a lazy wrapper or a class with methods.

### `fromPromise`

```typescript
function fromPromise<A, E extends ResultError>(
  promise: Promise<A>,
  onReject: (error: unknown) => E,
): ResultAsync<A, E>;
```

Converts fulfillment to `Ok` and rejection to `Err(onReject(error))`. It does not inspect fulfilled values.

### `tryCatch`

```typescript
function tryCatch<A, E extends ResultError>(
  fn: () => A,
  onError: (error: unknown) => E,
): Result<A, E>;
```

Runs `fn` immediately and converts a thrown value to a tagged error.

### `tryCatchAsync`

```typescript
function tryCatchAsync<A, E extends ResultError>(
  fn: () => Promise<A>,
  onError: (error: unknown) => E,
): ResultAsync<A, E>;
```

Catches both a synchronous throw while creating the promise and a promise rejection.

## Combinators

### `all`

```typescript
function all<T extends readonly Result<unknown, ResultError>[]>(
  results: [...T],
): Result<
  {
    -readonly [K in keyof T]: T[K] extends Result<infer A, ResultError>
      ? A
      : never;
  },
  {
    [K in keyof T]: T[K] extends Result<
      unknown,
      infer E extends ResultError
    >
      ? E
      : never;
  }[number]
>;
```

Walks the input tuple from left to right. It returns the first `Err` unchanged, or an `Ok` tuple preserving the value type at every position. The error type is the union of the input error types. Inputs have already been evaluated; `all` does not run them concurrently. The implementation uses private mapped-type aliases to express this return type; those aliases are not exported API.

### `firstOk`

```typescript
function firstOk<A, E extends ResultError>(
  results: Result<A, E>[],
): Result<A, ResultAggregateError>;
```

Returns the first `Ok`. If every entry is an `Err`—including an empty array—it returns `err(new ResultAggregateError(errors))`.

### `ResultAggregateError`

```typescript
class ResultAggregateError extends Error {
  readonly _tag: "ResultAggregateError";
  readonly errors: ResultError[];
  constructor(errors: ResultError[]);
}
```

The message joins the child messages as `All results failed: …`. The original error objects remain available in `errors`.

### `tap`

```typescript
function tap<A, E extends ResultError>(
  result: Result<A, E>,
  fn: (value: A) => void,
): Result<A, E>;
```

Calls `fn` only for `Ok`, then returns the same result object. Exceptions from `fn` propagate.

### `tapError`

```typescript
function tapError<A, E extends ResultError>(
  result: Result<A, E>,
  fn: (error: E) => void,
): Result<A, E>;
```

Calls `fn` only for `Err`, then returns the same result object. Exceptions from `fn` propagate.

## Error inference and runtime checks

### `InferErrorTag<E>`

```typescript
type InferErrorTag<E extends ResultError> = E["_tag"];
```

Extracts a single error's tag type.

### `InferErrorTags<E>`

```typescript
type InferErrorTags<E extends ResultError> = E extends ResultError
  ? E["_tag"]
  : never;
```

Distributes across an error union to produce the union of tag literals.

### `NarrowError<E, Tag>`

```typescript
type NarrowError<
  E extends ResultError,
  Tag extends string,
> = E extends { _tag: Tag } ? E : never;
```

Selects members of `E` whose `_tag` matches `Tag`.

### `isResultError`

```typescript
function isResultError(error: unknown): error is ResultError;
```

Returns `true` only when `error instanceof Error` and `error._tag` is a string. It does not require a literal tag at runtime.

### `assertResultError`

```typescript
function assertResultError(error: unknown): asserts error is ResultError;
```

Checks the same conditions as `isResultError`. It throws `TypeError` with a distinct message when the value is not an `Error` or lacks a string `_tag`.

# Result

Type-safe error handling with explicit success and failure states.

## Overview

The `@alt-stack/result` package provides a `Result<A, E>` type for explicit error handling without exceptions. Instead of throwing errors, functions return a `Result` that is either `Ok` (success) or `Err` (failure).

```typescript
import { ok, err, isOk, isErr, type Result } from "@alt-stack/result";

function divide(a: number, b: number): Result<number, DivisionError> {
  if (b === 0) {
    return err(new DivisionError("Cannot divide by zero"));
  }
  return ok(a / b);
}

const result = divide(10, 2);
if (isOk(result)) {
  console.log(result.value); // 5
}
```

## Installation

```bash
pnpm add @alt-stack/result
# or
npm install @alt-stack/result
# or
yarn add @alt-stack/result
```

## Why Result?

Traditional exception handling has drawbacks:

- **Hidden control flow** - Exceptions can be thrown from anywhere, making code hard to follow
- **No type information** - TypeScript can't track what errors a function might throw
- **Easy to forget** - Nothing forces you to handle potential errors

The Result pattern solves these:

- **Explicit** - Errors are part of the return type, visible in the function signature
- **Type-safe** - TypeScript knows exactly what errors can occur
- **Exhaustive** - You can ensure all error cases are handled at compile time

## Core Types

### Result

A discriminated union of `Ok<A>` (success) or `Err<E>` (failure):

```typescript
type Result<A, E extends ResultError = never> = Ok<A> | Err<E>;
```

### Ok

Contains the success value:

```typescript
interface Ok<A> {
  readonly _tag: "Ok";
  readonly value: A;
}
```

### Err

Contains the error:

```typescript
interface Err<E extends ResultError> {
  readonly _tag: "Err";
  readonly error: E;
}
```

## Error Requirements

Errors must extend JavaScript's `Error` class and have a `_tag` property with a string literal type. This enables exhaustive pattern matching:

```typescript
class NotFoundError extends Error {
  readonly _tag = "NotFoundError" as const;
  constructor(public readonly id: string) {
    super(`Resource ${id} not found`);
    this.name = "NotFoundError";
  }
}

class ValidationError extends Error {
  readonly _tag = "ValidationError" as const;
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
```

### TaggedError Base Class

For convenience, extend `TaggedError` which automatically sets `name` from `_tag`:

```typescript
import { TaggedError } from "@alt-stack/result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly id: string) {
    super(`Resource ${id} not found`);
  }
}
// error.name automatically returns "NotFoundError"
```

## Basic Usage

### Creating Results

```typescript
import { ok, err } from "@alt-stack/result";

// Success with value
const success = ok({ id: "123", name: "Alice" });

// Success without value (void)
const voidSuccess = ok();

// Error
const failure = err(new NotFoundError("123"));
```

### Checking Results

```typescript
import { isOk, isErr } from "@alt-stack/result";

if (isOk(result)) {
  console.log(result.value);
}

if (isErr(result)) {
  console.log(result.error._tag, result.error.message);
}
```

### Exhaustive Error Handling

The `_tag` property enables TypeScript to verify all error cases are handled:

```typescript
type GetUserError = NotFoundError | ValidationError | DatabaseError;

function handleError(result: Result<User, GetUserError>) {
  if (isErr(result)) {
    switch (result.error._tag) {
      case "NotFoundError":
        console.log(`User ${result.error.id} not found`);
        break;
      case "ValidationError":
        console.log(`Invalid field: ${result.error.field}`);
        break;
      case "DatabaseError":
        console.log(`Database error: ${result.error.message}`);
        break;
      // TypeScript ensures all cases are handled
    }
  }
}
```

## Complete Example

```typescript
import {
  ok,
  err,
  isOk,
  isErr,
  map,
  match,
  TaggedError,
  type Result,
} from "@alt-stack/result";

// Define errors
class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly userId: string) {
    super(`User ${userId} not found`);
  }
}

class InactiveError extends TaggedError {
  readonly _tag = "InactiveError";
  constructor(public readonly userId: string) {
    super(`User ${userId} is inactive`);
  }
}

// Define types
interface User {
  id: string;
  name: string;
  active: boolean;
}

// Function returning Result
function getActiveUser(
  id: string
): Result<User, NotFoundError | InactiveError> {
  const user = db.find(id);

  if (!user) {
    return err(new NotFoundError(id));
  }

  if (!user.active) {
    return err(new InactiveError(id));
  }

  return ok(user);
}

// Using the result
const result = getActiveUser("123");

const message = match(result, {
  ok: (user) => `Welcome, ${user.name}!`,
  err: (error) => {
    switch (error._tag) {
      case "NotFoundError":
        return `User ${error.userId} does not exist`;
      case "InactiveError":
        return `User ${error.userId} is deactivated`;
    }
  },
});
```

## Framework Integration

The Result type is used throughout Altstack:

- **Server** - Route handlers return Results with HTTP status codes
- **Kafka** - Message handlers return Results with error codes
- **Workers** - Job handlers return Results with error codes

Each framework re-exports the Result utilities, but you can also import directly from `@alt-stack/result` for standalone use.

## Next Steps

- [Constructors](./constructors) - Creating `ok()` and `err()` values
- [Type Guards](./type-guards) - `isOk()` and `isErr()` for narrowing
- [Transformations](./transformations) - `map()`, `flatMap()`, `mapError()`
- [Extraction](./extraction) - `unwrap()`, `unwrapOr()`, `getOrUndefined()`
- [Pattern Matching](./pattern-matching) - `match()` and `fold()`
- [Async Utilities](./async) - `fromPromise()`, `tryCatch()`, `tryCatchAsync()`
- [Combinators](./combinators) - `all()`, `firstOk()`, `tap()`
- [Type Inference](./type-inference) - `InferErrorTag`, `NarrowError`

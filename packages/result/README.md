# @alt-stack/result

Type-safe Result type for explicit error handling, inspired by Effect-TS.

## Documentation

📚 **Full documentation is available at:** [Result Documentation](https://altstack-docs.vercel.app/result)

## Installation

```bash
pnpm add @alt-stack/result
# or
npm install @alt-stack/result
# or
yarn add @alt-stack/result
```

## Quick Start

```typescript
import { ok, err, isOk, isErr, TaggedError, type Result } from "@alt-stack/result";

// Define errors with _tag for exhaustive handling
class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly id: string) {
    super(`Resource ${id} not found`);
  }
}

// Return Results instead of throwing
function getUser(id: string): Result<User, NotFoundError> {
  const user = db.find(id);
  if (!user) {
    return err(new NotFoundError(id));
  }
  return ok(user);
}

// Handle results with type guards
const result = getUser("123");
if (isOk(result)) {
  console.log(result.value.name);
} else {
  console.log(result.error._tag); // "NotFoundError"
}
```

## Error Requirements

Errors must extend `Error` and have a `_tag` property with a string literal type:

```typescript
// Option 1: Extend TaggedError (recommended)
class ValidationError extends TaggedError {
  readonly _tag = "ValidationError";
  constructor(public readonly field: string) {
    super(`Invalid field: ${field}`);
  }
}

// Option 2: Extend Error directly
class DatabaseError extends Error {
  readonly _tag = "DatabaseError" as const;
  constructor(message: string) {
    super(message);
    this.name = "DatabaseError";
  }
}
```

## Exhaustive Error Handling

The `_tag` property enables exhaustive `switch` statements:

```typescript
type UserError = NotFoundError | ValidationError | DatabaseError;

function handleError(error: UserError): string {
  switch (error._tag) {
    case "NotFoundError":
      return `User ${error.id} not found`;
    case "ValidationError":
      return `Invalid: ${error.field}`;
    case "DatabaseError":
      return `Database error: ${error.message}`;
    // TypeScript ensures all cases are handled
  }
}
```

## API Reference

### Core Types

- `Result<A, E>` - Discriminated union of `Ok<A>` or `Err<E>`
- `Ok<A>` - Success case with `value: A`
- `Err<E>` - Error case with `error: E`
- `ResultError` - Type constraint: `Error & { readonly _tag: string }`
- `TaggedError` - Base class that sets `name` from `_tag`

### Constructors

- `ok(value?)` - Create success Result (supports void)
- `err(error)` - Create error Result

### Type Guards

- `isOk(result)` - Narrow to `Ok<A>`
- `isErr(result)` - Narrow to `Err<E>`

### Transformations

- `map(result, fn)` - Transform success value
- `flatMap(result, fn)` - Chain Result-returning functions
- `mapError(result, fn)` - Transform error value
- `catchError(result, fn)` - Recover from errors

### Extraction

- `unwrap(result)` - Get value or throw
- `unwrapOr(result, default)` - Get value or default
- `unwrapOrElse(result, fn)` - Get value or compute default
- `getOrUndefined(result)` - Get value or undefined
- `getErrorOrUndefined(result)` - Get error or undefined

### Pattern Matching

- `match(result, { ok, err })` - Handle both cases
- `fold(result, onErr, onOk)` - Reduce to single value

### Async Utilities

- `ResultAsync<A, E>` - Type alias for `Promise<Result<A, E>>`
- `fromPromise(promise, onReject)` - Wrap promise in Result
- `tryCatch(fn, onError)` - Wrap sync function
- `tryCatchAsync(fn, onError)` - Wrap async function

### Combinators

- `all(results)` - Combine Results (fail-fast)
- `firstOk(results)` - Find first success
- `tap(result, fn)` - Side effect on success
- `tapError(result, fn)` - Side effect on error
- `ResultAggregateError` - Aggregates multiple errors

### Type Inference

- `InferErrorTag<E>` - Extract `_tag` literal type
- `InferErrorTags<E>` - Extract all `_tag` values from union
- `NarrowError<E, Tag>` - Narrow error union by tag
- `isResultError(error)` - Runtime check for ResultError
- `assertResultError(error)` - Runtime assertion

## Framework Integration

The Result type is used throughout Altstack packages. Server, Kafka, and Workers packages re-export Result utilities:

```typescript
// Import from framework package
import { ok, err, isOk, isErr } from "@alt-stack/server-hono";

// Or import directly
import { ok, err, isOk, isErr } from "@alt-stack/result";
```

## Related Packages

- [`@alt-stack/server-hono`](../server-hono/README.md) - Type-safe HTTP server
- [`@alt-stack/server-express`](../server-express/README.md) - Express adapter
- [`@alt-stack/workers-core`](../workers-core/README.md) - Background workers

## License

MIT

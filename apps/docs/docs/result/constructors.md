# Constructors

Create Result values with `ok()` and `err()`.

## ok()

Creates a success Result containing a value:

```typescript
import { ok } from "@alt-stack/result";

// With a value
const result = ok({ id: "123", name: "Alice" });
// Result<{ id: string; name: string }, never>

// Without a value (void)
const voidResult = ok();
// Result<void, never>
```

### Type Signature

```typescript
function ok<A>(value: A): Ok<A>;
function ok(): Ok<void>;
```

### Examples

```typescript
// Primitive values
const numberResult = ok(42);
const stringResult = ok("hello");
const boolResult = ok(true);

// Objects
const userResult = ok({ id: "123", name: "Alice", email: "alice@example.com" });

// Arrays
const listResult = ok([1, 2, 3]);

// Void (no value)
const doneResult = ok();
```

## err()

Creates a failure Result containing an error. The error must extend `Error` and have a `_tag` property:

```typescript
import { err, TaggedError } from "@alt-stack/result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly id: string) {
    super(`Resource ${id} not found`);
  }
}

const result = err(new NotFoundError("123"));
// Result<never, NotFoundError>
```

### Type Signature

```typescript
function err<E extends ResultError>(error: E): Err<E>;
```

### Error Requirements

Errors passed to `err()` must satisfy the `ResultError` type:

```typescript
type ResultError = Error & { readonly _tag: string };
```

This means:
1. Must extend JavaScript's `Error` class
2. Must have a `_tag` property with a string literal type

### Creating Errors

**Option 1: Extend TaggedError (recommended)**

```typescript
import { TaggedError } from "@alt-stack/result";

class ValidationError extends TaggedError {
  readonly _tag = "ValidationError";
  constructor(
    public readonly field: string,
    message: string
  ) {
    super(message);
  }
}
```

**Option 2: Extend Error directly**

```typescript
class DatabaseError extends Error {
  readonly _tag = "DatabaseError" as const;
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}
```

### Examples

```typescript
// Simple error
const notFound = err(new NotFoundError("user-123"));

// Error with metadata
class RateLimitError extends TaggedError {
  readonly _tag = "RateLimitError";
  constructor(
    public readonly retryAfter: number,
    public readonly limit: number
  ) {
    super(`Rate limit exceeded. Retry after ${retryAfter}s`);
  }
}

const rateLimited = err(new RateLimitError(60, 100));

// Accessing error properties
if (isErr(rateLimited)) {
  console.log(rateLimited.error.retryAfter); // 60
  console.log(rateLimited.error.limit); // 100
}
```

## Usage in Functions

Combine `ok()` and `err()` in functions that return `Result`:

```typescript
import { ok, err, type Result, TaggedError } from "@alt-stack/result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly id: string) {
    super(`User ${id} not found`);
  }
}

class InactiveError extends TaggedError {
  readonly _tag = "InactiveError";
  constructor(public readonly id: string) {
    super(`User ${id} is inactive`);
  }
}

interface User {
  id: string;
  name: string;
  active: boolean;
}

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
```

## Void Returns

Use `ok()` without arguments for functions that succeed without returning a value:

```typescript
function deleteUser(id: string): Result<void, NotFoundError> {
  const user = db.find(id);
  if (!user) {
    return err(new NotFoundError(id));
  }

  db.delete(id);
  return ok(); // Success with no value
}
```

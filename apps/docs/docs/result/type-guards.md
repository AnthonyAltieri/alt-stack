# Type Guards

Narrow Result types with `isOk()` and `isErr()`.

## isOk()

Type guard that narrows a Result to its `Ok` variant:

```typescript
import { ok, err, isOk } from "@alt-stack/result";

const result = ok({ id: "123", name: "Alice" });

if (isOk(result)) {
  // TypeScript knows result is Ok<{ id: string; name: string }>
  console.log(result.value.name); // "Alice"
}
```

### Type Signature

```typescript
function isOk<A, E extends ResultError>(result: Result<A, E>): result is Ok<A>;
```

## isErr()

Type guard that narrows a Result to its `Err` variant:

```typescript
import { err, isErr, TaggedError } from "@alt-stack/result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly id: string) {
    super(`Resource ${id} not found`);
  }
}

const result = err(new NotFoundError("123"));

if (isErr(result)) {
  // TypeScript knows result is Err<NotFoundError>
  console.log(result.error._tag); // "NotFoundError"
  console.log(result.error.id); // "123"
}
```

### Type Signature

```typescript
function isErr<A, E extends ResultError>(result: Result<A, E>): result is Err<E>;
```

## Basic Pattern

The standard pattern for handling Results:

```typescript
import { isOk, isErr, type Result } from "@alt-stack/result";

function handleResult(result: Result<User, NotFoundError>) {
  if (isOk(result)) {
    console.log("User:", result.value.name);
    return;
  }

  // TypeScript knows this is the error case
  console.log("Error:", result.error.message);
}
```

Or using `isErr` first:

```typescript
function handleResult(result: Result<User, NotFoundError>) {
  if (isErr(result)) {
    console.log("Error:", result.error.message);
    return;
  }

  // TypeScript knows this is the success case
  console.log("User:", result.value.name);
}
```

## Exhaustive Error Handling

The `_tag` property enables exhaustive `switch` statements:

```typescript
import { isErr, type Result, TaggedError } from "@alt-stack/result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly id: string) {
    super(`Resource ${id} not found`);
  }
}

class ValidationError extends TaggedError {
  readonly _tag = "ValidationError";
  constructor(public readonly field: string) {
    super(`Invalid field: ${field}`);
  }
}

class DatabaseError extends TaggedError {
  readonly _tag = "DatabaseError";
  constructor(message: string) {
    super(message);
  }
}

type UserError = NotFoundError | ValidationError | DatabaseError;

function handleUserResult(result: Result<User, UserError>) {
  if (isErr(result)) {
    switch (result.error._tag) {
      case "NotFoundError":
        // TypeScript narrows to NotFoundError
        console.log(`User ${result.error.id} not found`);
        break;
      case "ValidationError":
        // TypeScript narrows to ValidationError
        console.log(`Invalid field: ${result.error.field}`);
        break;
      case "DatabaseError":
        // TypeScript narrows to DatabaseError
        console.log(`Database error: ${result.error.message}`);
        break;
    }
    return;
  }

  console.log("User:", result.value.name);
}
```

### Compile-Time Exhaustiveness

Add a `default` case to ensure all errors are handled:

```typescript
if (isErr(result)) {
  switch (result.error._tag) {
    case "NotFoundError":
      return "Not found";
    case "ValidationError":
      return "Invalid input";
    case "DatabaseError":
      return "Database error";
    default:
      // TypeScript error if any case is missing
      const _exhaustive: never = result.error;
      throw new Error(`Unhandled error: ${_exhaustive}`);
  }
}
```

If you add a new error type but forget to handle it, TypeScript will report an error at compile time.

## Early Return Pattern

A common pattern is to handle errors first with early returns:

```typescript
async function processUser(id: string): Promise<string> {
  const userResult = await getUser(id);

  if (isErr(userResult)) {
    return `Error: ${userResult.error.message}`;
  }

  const user = userResult.value;

  const profileResult = await getProfile(user.profileId);

  if (isErr(profileResult)) {
    return `Error: ${profileResult.error.message}`;
  }

  const profile = profileResult.value;

  return `${user.name} - ${profile.bio}`;
}
```

## Combining with Transformations

Type guards work well with other Result utilities:

```typescript
import { isOk, map, flatMap } from "@alt-stack/result";

const result = getUser("123");

// Check first
if (isOk(result)) {
  const nameResult = map(result, (user) => user.name);
  // Safe to use
}

// Or use transformations directly
const nameResult = map(
  result,
  (user) => user.name
);

if (isOk(nameResult)) {
  console.log(nameResult.value);
}
```

## Type Inference

The guards preserve full type information:

```typescript
type MyResult = Result<
  { id: string; data: number[] },
  NotFoundError | ValidationError
>;

function process(result: MyResult) {
  if (isOk(result)) {
    // result.value is { id: string; data: number[] }
    const sum = result.value.data.reduce((a, b) => a + b, 0);
  }

  if (isErr(result)) {
    // result.error is NotFoundError | ValidationError
    // Can switch on _tag to narrow further
  }
}
```

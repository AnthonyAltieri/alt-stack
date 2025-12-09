# Transformations

Transform Result values with `map()`, `flatMap()`, `mapError()`, and `catchError()`.

## map()

Transform the success value without changing the error type:

```typescript
import { ok, err, map } from "@alt-stack/result";

const result = ok({ id: "123", name: "Alice" });

const nameResult = map(result, (user) => user.name);
// Result<string, never>

if (isOk(nameResult)) {
  console.log(nameResult.value); // "Alice"
}
```

### Type Signature

```typescript
function map<A, E extends ResultError, B>(
  result: Result<A, E>,
  fn: (value: A) => B
): Result<B, E>;
```

### Behavior

- If `Ok`, applies the function and returns a new `Ok` with the result
- If `Err`, returns the same error unchanged

```typescript
// Ok case: function is applied
map(ok(5), (x) => x * 2); // ok(10)

// Err case: function is NOT applied
map(err(new MyError()), (x) => x * 2); // err(MyError)
```

## flatMap()

Chain operations that return Results (monadic bind):

```typescript
import { ok, err, flatMap, type Result, TaggedError } from "@alt-stack/result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(message: string) {
    super(message);
  }
}

class InactiveError extends TaggedError {
  readonly _tag = "InactiveError";
  constructor(message: string) {
    super(message);
  }
}

function getUser(id: string): Result<User, NotFoundError> {
  const user = db.find(id);
  return user ? ok(user) : err(new NotFoundError(`User ${id} not found`));
}

function validateActive(user: User): Result<User, InactiveError> {
  return user.active
    ? ok(user)
    : err(new InactiveError(`User ${user.id} is inactive`));
}

// Chain the operations
const result = flatMap(getUser("123"), validateActive);
// Result<User, NotFoundError | InactiveError>
```

### Type Signature

```typescript
function flatMap<A, E extends ResultError, B, E2 extends ResultError>(
  result: Result<A, E>,
  fn: (value: A) => Result<B, E2>
): Result<B, E | E2>;
```

### Behavior

- If `Ok`, applies the function and returns its result (which is itself a Result)
- If `Err`, returns the same error unchanged
- Error types are accumulated in a union

```typescript
// Ok case: function is applied, returns new Result
flatMap(ok(5), (x) => (x > 0 ? ok(x * 2) : err(new NegativeError())));

// Err case: function is NOT applied
flatMap(err(new MyError()), (x) => ok(x * 2)); // err(MyError)
```

### Chaining Multiple Operations

```typescript
const result = flatMap(getUser("123"), (user) =>
  flatMap(validateActive(user), (activeUser) =>
    flatMap(getProfile(activeUser.profileId), (profile) =>
      ok({ user: activeUser, profile })
    )
  )
);
// Result<{ user: User; profile: Profile }, NotFoundError | InactiveError | ProfileError>
```

## mapError()

Transform the error value without changing the success type:

```typescript
import { err, mapError, TaggedError } from "@alt-stack/result";

class InternalError extends TaggedError {
  readonly _tag = "InternalError";
  constructor(public readonly originalError: Error) {
    super("An internal error occurred");
  }
}

const result = err(new NotFoundError("123"));

const mapped = mapError(result, (error) => new InternalError(error));
// Result<never, InternalError>
```

### Type Signature

```typescript
function mapError<A, E extends ResultError, E2 extends ResultError>(
  result: Result<A, E>,
  fn: (error: E) => E2
): Result<A, E2>;
```

### Behavior

- If `Ok`, returns the same success unchanged
- If `Err`, applies the function and returns a new `Err` with the result

```typescript
// Err case: function is applied
mapError(err(new NotFoundError("x")), (e) => new WrappedError(e));

// Ok case: function is NOT applied
mapError(ok(5), (e) => new WrappedError(e)); // ok(5)
```

### Use Cases

**Wrapping errors:**

```typescript
const result = mapError(
  externalApiCall(),
  (error) => new ApiError(`External API failed: ${error.message}`)
);
```

**Adding context:**

```typescript
const result = mapError(getUser(id), (error) => ({
  ...error,
  context: { userId: id, timestamp: Date.now() },
}));
```

## catchError()

Recover from errors by providing a fallback:

```typescript
import { err, catchError, ok, TaggedError } from "@alt-stack/result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly id: string) {
    super(`Not found: ${id}`);
  }
}

const result = err(new NotFoundError("123"));

const recovered = catchError(result, (error) => {
  if (error._tag === "NotFoundError") {
    return ok({ id: error.id, name: "Default User", isDefault: true });
  }
  return err(error); // Re-throw other errors
});
```

### Type Signature

```typescript
function catchError<A, E extends ResultError, B, E2 extends ResultError>(
  result: Result<A, E>,
  fn: (error: E) => Result<B, E2>
): Result<A | B, E2>;
```

### Behavior

- If `Ok`, returns the same success unchanged
- If `Err`, applies the function which can return either `Ok` (recovery) or `Err` (different error)

### Use Cases

**Provide default values:**

```typescript
const userResult = catchError(getUser(id), () =>
  ok({ id: "guest", name: "Guest User" })
);
```

**Handle specific errors:**

```typescript
const result = catchError(fetchData(), (error) => {
  switch (error._tag) {
    case "NotFoundError":
      return ok([]); // Return empty array for not found
    case "NetworkError":
      return ok(cachedData); // Use cache on network error
    default:
      return err(error); // Propagate other errors
  }
});
```

**Transform to different error:**

```typescript
const result = catchError(parseJson(input), (error) =>
  err(new ValidationError(`Invalid JSON: ${error.message}`))
);
```

## Combining Transformations

Transformations can be combined for complex workflows:

```typescript
import { map, flatMap, mapError, catchError } from "@alt-stack/result";

const result = flatMap(getUser(id), (user) =>
  map(
    catchError(
      getProfile(user.profileId),
      () => ok({ bio: "No bio available" }) // Default profile
    ),
    (profile) => ({ ...user, profile })
  )
);
```

## Comparison

| Function | Input | Output | Use When |
|----------|-------|--------|----------|
| `map` | `A => B` | Same error type | Transforming success values |
| `flatMap` | `A => Result<B, E2>` | Accumulated errors | Chaining Result-returning functions |
| `mapError` | `E => E2` | Same success type | Transforming or wrapping errors |
| `catchError` | `E => Result<B, E2>` | Success type union | Recovering from errors |

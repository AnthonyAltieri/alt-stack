# Pattern Matching

Handle both success and error cases with `match()` and `fold()`.

## match()

Handle both `Ok` and `Err` cases with an object of handlers:

```typescript
import { ok, err, match, TaggedError } from "@alt-stack/result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly id: string) {
    super(`Resource ${id} not found`);
  }
}

const result = ok({ id: "123", name: "Alice" });

const message = match(result, {
  ok: (user) => `Welcome, ${user.name}!`,
  err: (error) => `Error: ${error.message}`,
});
// "Welcome, Alice!"
```

### Type Signature

```typescript
function match<A, E extends ResultError, B, C>(
  result: Result<A, E>,
  handlers: {
    ok: (value: A) => B;
    err: (error: E) => C;
  }
): B | C;
```

### Examples

**Returning different types:**

```typescript
const response = match(getUserResult, {
  ok: (user) => ({ status: 200, body: user }),
  err: (error) => ({ status: 404, body: { error: error.message } }),
});
```

**Side effects:**

```typescript
match(result, {
  ok: (value) => {
    console.log("Success:", value);
    analytics.track("success");
  },
  err: (error) => {
    console.error("Error:", error);
    analytics.track("error", { type: error._tag });
  },
});
```

**Exhaustive error handling within match:**

```typescript
type UserError = NotFoundError | ValidationError | DatabaseError;

const message = match(result as Result<User, UserError>, {
  ok: (user) => `User: ${user.name}`,
  err: (error) => {
    switch (error._tag) {
      case "NotFoundError":
        return `User ${error.id} not found`;
      case "ValidationError":
        return `Invalid: ${error.field}`;
      case "DatabaseError":
        return `Database error: ${error.message}`;
    }
  },
});
```

## fold()

Reduce a Result to a single value with separate handlers:

```typescript
import { ok, err, fold } from "@alt-stack/result";

const result = ok(42);

const doubled = fold(
  result,
  (error) => 0,        // Error handler (first)
  (value) => value * 2 // Success handler (second)
);
// 84
```

### Type Signature

```typescript
function fold<A, E extends ResultError, B>(
  result: Result<A, E>,
  onErr: (error: E) => B,
  onOk: (value: A) => B
): B;
```

### Behavior

- Both handlers must return the same type
- Error handler is the first argument (matches the conventional `Either` "left" position)
- Success handler is the second argument

### Examples

**Converting to nullable:**

```typescript
const maybeUser = fold(
  getUserResult,
  () => null,
  (user) => user
);
// User | null
```

**Computing derived values:**

```typescript
const status = fold(
  operationResult,
  (error) => ({ success: false, error: error.message }),
  (value) => ({ success: true, data: value })
);
```

**Metrics:**

```typescript
const metricValue = fold(
  result,
  (error) => {
    metrics.increment("errors");
    return 0;
  },
  (value) => {
    metrics.increment("successes");
    return value.count;
  }
);
```

## match vs fold

Both functions handle success and error cases, but differ in syntax:

**match** - Object with named handlers:

```typescript
match(result, {
  ok: (value) => handleSuccess(value),
  err: (error) => handleError(error),
});
```

**fold** - Positional arguments (error first, then success):

```typescript
fold(
  result,
  (error) => handleError(error),
  (value) => handleSuccess(value)
);
```

### When to Use Each

**Use `match` when:**
- You want explicit, named cases for readability
- The handlers are complex or multi-line
- You're working with a team unfamiliar with functional patterns

**Use `fold` when:**
- You prefer the traditional Either/Result convention
- You're doing quick transformations
- You're chaining with other functional utilities

## Comparison with Type Guards

Type guards (`isOk`, `isErr`) and pattern matching serve different purposes:

**Type guards** - Conditional flow with side effects:

```typescript
if (isOk(result)) {
  doSomething(result.value);
  doSomethingElse();
  return result.value;
}
handleError(result.error);
```

**Pattern matching** - Expression-based transformations:

```typescript
const transformed = match(result, {
  ok: (value) => transform(value),
  err: (error) => defaultValue,
});
```

## Real-World Examples

**API Response:**

```typescript
function handleApiResult(result: Result<User, ApiError>): Response {
  return match(result, {
    ok: (user) =>
      new Response(JSON.stringify(user), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    err: (error) =>
      new Response(JSON.stringify({ error: error.message }), {
        status: error._tag === "NotFoundError" ? 404 : 500,
        headers: { "Content-Type": "application/json" },
      }),
  });
}
```

**React Rendering:**

```typescript
function UserProfile({ userResult }: { userResult: Result<User, UserError> }) {
  return match(userResult, {
    ok: (user) => (
      <div>
        <h1>{user.name}</h1>
        <p>{user.email}</p>
      </div>
    ),
    err: (error) => (
      <div className="error">
        <p>Failed to load user: {error.message}</p>
      </div>
    ),
  });
}
```

**Logging:**

```typescript
fold(
  operationResult,
  (error) => {
    logger.error("Operation failed", { error: error._tag, message: error.message });
    return { logged: true, success: false };
  },
  (value) => {
    logger.info("Operation succeeded", { value });
    return { logged: true, success: true };
  }
);
```

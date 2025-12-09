# Extraction

Extract values from Results with `unwrap()`, `unwrapOr()`, `unwrapOrElse()`, `getOrUndefined()`, and `getErrorOrUndefined()`.

## unwrap()

Get the value or throw the error:

```typescript
import { ok, err, unwrap, TaggedError } from "@alt-stack/result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(message: string) {
    super(message);
  }
}

// Success case
const value = unwrap(ok(42)); // 42

// Error case - throws!
const value2 = unwrap(err(new NotFoundError("Not found"))); // throws NotFoundError
```

### Type Signature

```typescript
function unwrap<A, E extends ResultError>(result: Result<A, E>): A;
```

### When to Use

Use `unwrap()` sparingly, only when:
- You're certain the Result is `Ok`
- Throwing is acceptable behavior
- Testing scenarios

```typescript
// In tests where failure should fail the test
const user = unwrap(await createTestUser());
expect(user.name).toBe("Test User");

// After validation that guarantees success
const validated = validateInput(input);
if (isErr(validated)) {
  throw validated.error;
}
// At this point we know it's Ok
const value = unwrap(validated);
```

## unwrapOr()

Get the value or return a default:

```typescript
import { ok, err, unwrapOr } from "@alt-stack/result";

const successResult = ok({ name: "Alice" });
const errorResult = err(new NotFoundError("User not found"));

// Success case - returns value
const user1 = unwrapOr(successResult, { name: "Guest" });
// { name: "Alice" }

// Error case - returns default
const user2 = unwrapOr(errorResult, { name: "Guest" });
// { name: "Guest" }
```

### Type Signature

```typescript
function unwrapOr<A, E extends ResultError>(result: Result<A, E>, defaultValue: A): A;
```

### Use Cases

```typescript
// Default values for optional data
const theme = unwrapOr(getUserPreference("theme"), "light");

// Fallback for failed operations
const config = unwrapOr(loadConfig(), defaultConfig);

// Safe property access
const count = unwrapOr(getItemCount(), 0);
```

## unwrapOrElse()

Get the value or compute a default from the error:

```typescript
import { ok, err, unwrapOrElse } from "@alt-stack/result";

const result = err(new NotFoundError("user-123"));

const value = unwrapOrElse(result, (error) => {
  console.log(`Using default because: ${error.message}`);
  return { id: "default", name: "Guest" };
});
```

### Type Signature

```typescript
function unwrapOrElse<A, E extends ResultError>(
  result: Result<A, E>,
  fn: (error: E) => A
): A;
```

### Use Cases

**Logging errors while providing defaults:**

```typescript
const user = unwrapOrElse(getUser(id), (error) => {
  logger.warn(`Failed to get user: ${error.message}`);
  return guestUser;
});
```

**Computing defaults based on error type:**

```typescript
const data = unwrapOrElse(fetchData(), (error) => {
  switch (error._tag) {
    case "NetworkError":
      return cachedData;
    case "NotFoundError":
      return [];
    default:
      return defaultData;
  }
});
```

**Lazy evaluation:**

```typescript
// The function is only called if the result is an error
const config = unwrapOrElse(loadConfig(), () => computeExpensiveDefault());
```

## getOrUndefined()

Get the value or `undefined`:

```typescript
import { ok, err, getOrUndefined } from "@alt-stack/result";

const success = ok({ name: "Alice" });
const failure = err(new NotFoundError("Not found"));

getOrUndefined(success); // { name: "Alice" }
getOrUndefined(failure); // undefined
```

### Type Signature

```typescript
function getOrUndefined<A, E extends ResultError>(result: Result<A, E>): A | undefined;
```

### Use Cases

**Optional chaining:**

```typescript
const user = getOrUndefined(getUser(id));
const name = user?.name ?? "Unknown";
```

**Conditional rendering:**

```typescript
const data = getOrUndefined(result);
if (data) {
  renderData(data);
}
```

**Array filtering:**

```typescript
const results = [getUser("1"), getUser("2"), getUser("3")];
const users = results.map(getOrUndefined).filter(Boolean);
// Only successful results
```

## getErrorOrUndefined()

Get the error or `undefined`:

```typescript
import { ok, err, getErrorOrUndefined } from "@alt-stack/result";

const success = ok({ name: "Alice" });
const failure = err(new NotFoundError("Not found"));

getErrorOrUndefined(success); // undefined
getErrorOrUndefined(failure); // NotFoundError
```

### Type Signature

```typescript
function getErrorOrUndefined<A, E extends ResultError>(
  result: Result<A, E>
): E | undefined;
```

### Use Cases

**Error logging:**

```typescript
const error = getErrorOrUndefined(result);
if (error) {
  logger.error(error);
}
```

**Collecting errors:**

```typescript
const results = await Promise.all(items.map(process));
const errors = results.map(getErrorOrUndefined).filter(Boolean);

if (errors.length > 0) {
  reportErrors(errors);
}
```

**Error metrics:**

```typescript
const error = getErrorOrUndefined(result);
if (error) {
  metrics.increment(`errors.${error._tag}`);
}
```

## Comparison

| Function | Returns | Throws | Use When |
|----------|---------|--------|----------|
| `unwrap` | Value | Error | You're certain it's Ok, or throwing is acceptable |
| `unwrapOr` | Value or default | Never | You have a static default value |
| `unwrapOrElse` | Value or computed | Never | Default depends on error or is expensive to compute |
| `getOrUndefined` | Value or undefined | Never | Working with optional values |
| `getErrorOrUndefined` | Error or undefined | Never | Inspecting errors without type guards |

## Safety Guidelines

**Prefer safe extraction methods:**

```typescript
// Good - handles both cases
const value = unwrapOr(result, defaultValue);

// Good - explicit handling
if (isOk(result)) {
  return result.value;
}
return handleError(result.error);

// Use with caution - can throw
const value = unwrap(result);
```

**Use `unwrap()` only when failure is exceptional:**

```typescript
// Good - test assertion
const user = unwrap(createTestUser());

// Bad - runtime uncertainty
const user = unwrap(getUser(id)); // Might throw!

// Better
const userResult = getUser(id);
if (isErr(userResult)) {
  return err(userResult.error);
}
const user = userResult.value;
```

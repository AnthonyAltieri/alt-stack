# Combinators

Combine and observe Results with `all()`, `firstOk()`, `tap()`, and `tapError()`.

## all()

Combine multiple Results into a single Result containing an array of values. Fails fast on the first error:

```typescript
import { ok, err, all, TaggedError } from "@alt-stack/result";

class ValidationError extends TaggedError {
  readonly _tag = "ValidationError";
  constructor(public readonly field: string) {
    super(`Invalid field: ${field}`);
  }
}

const results = [
  ok({ name: "Alice" }),
  ok({ name: "Bob" }),
  ok({ name: "Charlie" }),
];

const combined = all(results);
// Result<[{ name: string }, { name: string }, { name: string }], ValidationError>

if (isOk(combined)) {
  console.log(combined.value);
  // [{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }]
}
```

### Type Signature

```typescript
function all<T extends readonly Result<any, ResultError>[]>(
  results: T
): Result<
  { [K in keyof T]: T[K] extends Result<infer A, any> ? A : never },
  T[number] extends Result<any, infer E> ? E : never
>;
```

### Fail-Fast Behavior

Returns the first error encountered:

```typescript
const results = [
  ok(1),
  err(new ValidationError("email")), // First error
  err(new ValidationError("name")),  // Never checked
];

const combined = all(results);
// Err<ValidationError> with field: "email"
```

### Examples

**Validating multiple fields:**

```typescript
function validateUser(input: unknown) {
  return all([
    validateName(input.name),
    validateEmail(input.email),
    validateAge(input.age),
  ]);
}

const result = validateUser(formData);
if (isOk(result)) {
  const [name, email, age] = result.value;
  createUser({ name, email, age });
}
```

**Fetching multiple resources:**

```typescript
const [user, profile, settings] = unwrap(
  all([
    await getUser(userId),
    await getProfile(userId),
    await getSettings(userId),
  ])
);
```

## firstOk()

Return the first successful Result, or aggregate all errors:

```typescript
import { ok, err, firstOk, TaggedError } from "@alt-stack/result";

class CacheError extends TaggedError {
  readonly _tag = "CacheError";
  constructor(message: string) {
    super(message);
  }
}

class DatabaseError extends TaggedError {
  readonly _tag = "DatabaseError";
  constructor(message: string) {
    super(message);
  }
}

const results = [
  err(new CacheError("Cache miss")),
  ok({ id: "123", name: "Alice" }), // First success
  ok({ id: "456", name: "Bob" }),   // Not checked
];

const first = firstOk(results);
// Ok<{ id: string; name: string }>
```

### Type Signature

```typescript
function firstOk<A, E extends ResultError>(
  results: Result<A, E>[]
): Result<A, ResultAggregateError<E>>;
```

### ResultAggregateError

When all Results are errors, returns a `ResultAggregateError` containing all errors:

```typescript
import { ResultAggregateError } from "@alt-stack/result";

const results = [
  err(new CacheError("Cache miss")),
  err(new DatabaseError("Connection failed")),
];

const result = firstOk(results);

if (isErr(result) && result.error instanceof ResultAggregateError) {
  console.log(result.error.errors);
  // [CacheError, DatabaseError]

  for (const e of result.error.errors) {
    console.log(e._tag, e.message);
  }
}
```

### Use Cases

**Fallback strategies:**

```typescript
const userData = firstOk([
  await getFromCache(userId),
  await getFromDatabase(userId),
  await getFromBackup(userId),
]);
```

**Multiple data sources:**

```typescript
const config = firstOk([
  loadFromEnv(),
  loadFromFile("./config.json"),
  ok(defaultConfig),
]);
```

## tap()

Execute a side effect on success without changing the Result:

```typescript
import { ok, err, tap } from "@alt-stack/result";

const result = ok({ id: "123", name: "Alice" });

const same = tap(result, (user) => {
  console.log(`Loaded user: ${user.name}`);
  analytics.track("user_loaded", { userId: user.id });
});
// Returns the same Result, side effect executed
```

### Type Signature

```typescript
function tap<A, E extends ResultError>(
  result: Result<A, E>,
  fn: (value: A) => void
): Result<A, E>;
```

### Behavior

- If `Ok`, executes the function and returns the same `Ok`
- If `Err`, returns the same `Err` without calling the function

### Examples

**Logging:**

```typescript
const result = tap(getUserResult, (user) => {
  logger.info("User fetched successfully", { userId: user.id });
});
```

**Metrics:**

```typescript
const result = tap(operationResult, () => {
  metrics.increment("operations.success");
});
```

**Caching:**

```typescript
const result = tap(fetchResult, (data) => {
  cache.set(cacheKey, data, { ttl: 3600 });
});
```

## tapError()

Execute a side effect on error without changing the Result:

```typescript
import { ok, err, tapError, TaggedError } from "@alt-stack/result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly id: string) {
    super(`Not found: ${id}`);
  }
}

const result = err(new NotFoundError("123"));

const same = tapError(result, (error) => {
  console.error(`Error occurred: ${error._tag}`);
  errorReporter.capture(error);
});
// Returns the same Result, side effect executed
```

### Type Signature

```typescript
function tapError<A, E extends ResultError>(
  result: Result<A, E>,
  fn: (error: E) => void
): Result<A, E>;
```

### Behavior

- If `Err`, executes the function and returns the same `Err`
- If `Ok`, returns the same `Ok` without calling the function

### Examples

**Error logging:**

```typescript
const result = tapError(operationResult, (error) => {
  logger.error("Operation failed", {
    errorType: error._tag,
    message: error.message,
  });
});
```

**Error reporting:**

```typescript
const result = tapError(apiResult, (error) => {
  sentry.captureException(error);
});
```

**Metrics:**

```typescript
const result = tapError(result, (error) => {
  metrics.increment(`errors.${error._tag}`);
});
```

## Combining tap and tapError

Chain both to observe all outcomes:

```typescript
const result = tap(
  tapError(operationResult, (error) => {
    logger.error("Failed", { error: error._tag });
    metrics.increment("failures");
  }),
  (value) => {
    logger.info("Succeeded", { value });
    metrics.increment("successes");
  }
);
```

## Comparison

| Function | Success Behavior | Error Behavior | Returns |
|----------|-----------------|----------------|---------|
| `all` | Combines all values | Fails on first error | Single Result with array |
| `firstOk` | Returns first success | Aggregates all errors | Single Result |
| `tap` | Executes side effect | Unchanged | Same Result |
| `tapError` | Unchanged | Executes side effect | Same Result |

## Real-World Example

```typescript
import { all, tap, tapError, tryCatchAsync } from "@alt-stack/result";

async function processOrder(orderId: string) {
  // Fetch all required data
  const dataResult = all([
    await tryCatchAsync(() => getOrder(orderId), (e) => new OrderError(e)),
    await tryCatchAsync(() => getCustomer(customerId), (e) => new CustomerError(e)),
    await tryCatchAsync(() => getInventory(productId), (e) => new InventoryError(e)),
  ]);

  // Log the outcome
  const logged = tap(
    tapError(dataResult, (error) => {
      logger.error("Order processing failed", { orderId, error: error._tag });
    }),
    ([order, customer, inventory]) => {
      logger.info("Order data loaded", { orderId, customerId: customer.id });
    }
  );

  // Process the order
  if (isOk(logged)) {
    const [order, customer, inventory] = logged.value;
    return processOrderWithData(order, customer, inventory);
  }

  return logged;
}
```

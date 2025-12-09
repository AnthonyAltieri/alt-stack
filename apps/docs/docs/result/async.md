# Async Utilities

Work with async operations using `ResultAsync`, `fromPromise()`, `tryCatch()`, and `tryCatchAsync()`.

## ResultAsync

Type alias for a Promise that resolves to a Result:

```typescript
type ResultAsync<A, E extends ResultError> = Promise<Result<A, E>>;
```

Use this type for functions that perform async operations and return Results:

```typescript
import { type ResultAsync, ok, err, TaggedError } from "@alt-stack/result";

class FetchError extends TaggedError {
  readonly _tag = "FetchError";
  constructor(message: string) {
    super(message);
  }
}

async function fetchUser(id: string): ResultAsync<User, FetchError> {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) {
      return err(new FetchError(`HTTP ${response.status}`));
    }
    const user = await response.json();
    return ok(user);
  } catch (e) {
    return err(new FetchError(String(e)));
  }
}
```

## fromPromise()

Convert a Promise to a ResultAsync by catching rejections:

```typescript
import { fromPromise, TaggedError } from "@alt-stack/result";

class NetworkError extends TaggedError {
  readonly _tag = "NetworkError";
  constructor(public readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

const result = await fromPromise(
  fetch("/api/data").then((r) => r.json()),
  (error) => new NetworkError(error)
);
// Result<unknown, NetworkError>
```

### Type Signature

```typescript
function fromPromise<A, E extends ResultError>(
  promise: Promise<A>,
  onReject: (error: unknown) => E
): ResultAsync<A, E>;
```

### Behavior

- If the promise resolves, returns `Ok` with the value
- If the promise rejects, calls `onReject` with the rejection reason and returns `Err`

### Examples

**Wrapping fetch:**

```typescript
const userResult = await fromPromise(
  fetch("/api/user/123").then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }),
  (error) => new FetchError(error)
);
```

**Database operations:**

```typescript
const queryResult = await fromPromise(
  db.query("SELECT * FROM users WHERE id = ?", [userId]),
  (error) => new DatabaseError(error)
);
```

**External APIs:**

```typescript
const weatherResult = await fromPromise(
  weatherApi.getForecast(location),
  (error) => new WeatherApiError(error)
);
```

## tryCatch()

Wrap a synchronous function that might throw:

```typescript
import { tryCatch, TaggedError } from "@alt-stack/result";

class ParseError extends TaggedError {
  readonly _tag = "ParseError";
  constructor(message: string) {
    super(message);
  }
}

const result = tryCatch(
  () => JSON.parse(userInput),
  (error) => new ParseError(error instanceof Error ? error.message : "Parse failed")
);
// Result<unknown, ParseError>
```

### Type Signature

```typescript
function tryCatch<A, E extends ResultError>(
  fn: () => A,
  onError: (error: unknown) => E
): Result<A, E>;
```

### Behavior

- Executes the function in a try-catch
- If it returns successfully, returns `Ok` with the value
- If it throws, calls `onError` with the thrown value and returns `Err`

### Examples

**JSON parsing:**

```typescript
const configResult = tryCatch(
  () => JSON.parse(configString),
  (error) => new ConfigParseError(error)
);

if (isOk(configResult)) {
  applyConfig(configResult.value);
}
```

**Regex operations:**

```typescript
const regexResult = tryCatch(
  () => new RegExp(userPattern),
  (error) => new InvalidRegexError(userPattern, error)
);
```

**Validation:**

```typescript
const validated = tryCatch(
  () => schema.parse(input),
  (error) => new ValidationError(error)
);
```

## tryCatchAsync()

Wrap an async function that might throw or reject:

```typescript
import { tryCatchAsync, TaggedError } from "@alt-stack/result";

class ApiError extends TaggedError {
  readonly _tag = "ApiError";
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
  }
}

const result = await tryCatchAsync(
  async () => {
    const response = await fetch("/api/data");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  },
  (error) => new ApiError(error instanceof Error ? error.message : "Request failed")
);
```

### Type Signature

```typescript
function tryCatchAsync<A, E extends ResultError>(
  fn: () => Promise<A>,
  onError: (error: unknown) => E
): ResultAsync<A, E>;
```

### Behavior

- Executes the async function
- If it resolves, returns `Ok` with the value
- If it throws synchronously or rejects, calls `onError` and returns `Err`

### Examples

**Fetching with error handling:**

```typescript
const fetchUserResult = await tryCatchAsync(
  async () => {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) {
      throw new Error(`User fetch failed: ${response.status}`);
    }
    return response.json() as Promise<User>;
  },
  (error) => new FetchError(error)
);
```

**Database transactions:**

```typescript
const transactionResult = await tryCatchAsync(
  async () => {
    await db.beginTransaction();
    await db.insert("users", userData);
    await db.insert("profiles", profileData);
    await db.commit();
    return { userId, profileId };
  },
  async (error) => {
    await db.rollback();
    return new TransactionError(error);
  }
);
```

**File operations:**

```typescript
const fileResult = await tryCatchAsync(
  async () => {
    const content = await fs.readFile(path, "utf-8");
    return JSON.parse(content);
  },
  (error) => new FileReadError(path, error)
);
```

## Combining with Other Utilities

Async Results work with all other Result utilities:

```typescript
import { tryCatchAsync, flatMap, map, match, isOk } from "@alt-stack/result";

// Chaining async operations
async function processUser(id: string) {
  const userResult = await tryCatchAsync(
    () => fetchUser(id),
    (e) => new FetchError(e)
  );

  if (isOk(userResult)) {
    const profileResult = await tryCatchAsync(
      () => fetchProfile(userResult.value.profileId),
      (e) => new FetchError(e)
    );

    return map(profileResult, (profile) => ({
      user: userResult.value,
      profile,
    }));
  }

  return userResult;
}

// Pattern matching on async result
const message = match(await fetchUserResult, {
  ok: (user) => `Loaded ${user.name}`,
  err: (error) => `Failed: ${error.message}`,
});
```

## fromPromise vs tryCatchAsync

| Function | Input | Catches |
|----------|-------|---------|
| `fromPromise` | Existing Promise | Promise rejections only |
| `tryCatchAsync` | Function returning Promise | Sync throws AND Promise rejections |

**Use `fromPromise`** when you have an existing Promise:

```typescript
const promise = someLibrary.doSomething();
const result = await fromPromise(promise, handleError);
```

**Use `tryCatchAsync`** when you're creating the Promise and might throw synchronously:

```typescript
const result = await tryCatchAsync(
  async () => {
    validateInput(input); // Might throw synchronously
    return await fetchData(input); // Might reject
  },
  handleError
);
```

# Result common patterns

## Convert thrown boundaries once

Keep unknown exceptions at the edge of your application. Convert them into a tagged error before they enter typed business logic.

```typescript
import { TaggedError, tryCatchAsync } from "@alt-stack/result";

class ProfileRequestError extends TaggedError {
  readonly _tag = "ProfileRequestError" as const;

  constructor(readonly cause: unknown) {
    super("The profile request failed");
  }
}

const result = await tryCatchAsync(
  async () => {
    const response = await fetch("https://example.test/profile");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<unknown>;
  },
  (cause) => new ProfileRequestError(cause),
);
```

Use `tryCatch` for synchronous functions, `tryCatchAsync` for a function that creates a promise, and `fromPromise` when you already have the promise.

## Build a typed pipeline

```typescript
import { flatMap, map, type Result } from "@alt-stack/result";

declare const parseUser: (input: unknown) => Result<User, ParseUserError>;
declare const authorize: (user: User) => Result<User, ForbiddenError>;

const label = map(
  flatMap(parseUser(input), authorize),
  (user) => `${user.id}:${user.name}`,
);
```

The returned error type is `ParseUserError | ForbiddenError`. Neither callback runs after the first `Err`.

## Recover deliberately

`catchError` handles the original error and replaces it with the fallback's error type.

```typescript
import { catchError, ok } from "@alt-stack/result";

const userOrGuest = catchError(findUser(id), () =>
  ok({ id: "guest", name: "Guest" }),
);
```

Use `mapError` when the failure remains a failure but needs a different public shape—for example, translating an infrastructure error into a domain error.

## Combine independent work

`all` returns the first error in input order or an `Ok` tuple containing every value.

```typescript
import { all, ok } from "@alt-stack/result";

const combined = all([ok("Ada"), ok(37), ok(true)]);
// Result<[string, number, boolean], ...>
```

`firstOk` tries results in order. If none succeeds, it returns `ResultAggregateError`, whose `errors` property contains every failure.

```typescript
import { err, firstOk } from "@alt-stack/result";

const selected = firstOk([
  err(new PrimaryUnavailableError()),
  err(new SecondaryUnavailableError()),
]);
```

These combinators consume already-computed results; they do not add concurrency or laziness.

## Collapse at presentation boundaries

Use `match` when success and failure may produce different types, or `fold` when both handlers must return the same type.

```typescript
import { match } from "@alt-stack/result";

const response = match(findUser(id), {
  ok: (user) => ({ status: 200, body: user }),
  err: (error) => ({ status: 404, body: { message: error.message } }),
});
```

Prefer `unwrapOr`, `unwrapOrElse`, or `getOrUndefined` for an intentional default. Reserve `unwrap` for a boundary where throwing the original error is the desired contract.

## Observe without changing the value

`tap` and `tapError` return the original `Result`. They are useful for metrics or structured logs after the business decision has already been made.

```typescript
import { tap, tapError } from "@alt-stack/result";

const observed = tapError(
  tap(findUser(id), () => metrics.increment("user.lookup.ok")),
  (error) => metrics.increment("user.lookup.error", { tag: error._tag }),
);
```

Keep callbacks synchronous and small. If observation can fail or must be awaited, model it as another explicit operation instead of hiding it inside `tap`.

## Validate unknown errors

`isResultError` accepts only an actual `Error` instance with a string `_tag`. `assertResultError` enforces the same rule and throws `TypeError` when it fails.

```typescript
import { err, isResultError } from "@alt-stack/result";

try {
  await runPlugin();
} catch (error) {
  return isResultError(error)
    ? err(error)
    : err(new UnknownPluginError(error));
}
```

A plain object such as `{ _tag: "Failure" }` is not a `ResultError` at runtime because it is not an `Error` instance.

## See also

[Result API Documentation](./api.md) lists exact signatures, properties, and type effects.

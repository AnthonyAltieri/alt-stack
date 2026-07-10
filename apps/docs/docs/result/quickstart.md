# Result quickstart

`@alt-stack/result` represents expected failures as a discriminated union. A successful value has `_tag: "Ok"`; a failed value has `_tag: "Err"` and carries an `Error` with its own string `_tag`.

## 1. Install

The Result implementation has no runtime dependency. Its manifest declares Zod 4 as an optional peer for ecosystem compatibility.

```bash
pnpm add @alt-stack/result
```

## 2. Define a tagged error

`TaggedError` keeps `Error.name` synchronized with `_tag`. Pass the intended tag as its type argument when you want the base class to enforce an exact literal.

```typescript
import {
  TaggedError,
  err,
  isErr,
  ok,
  type Result,
} from "@alt-stack/result";

interface User {
  id: string;
  name: string;
}

class UserNotFoundError extends TaggedError<"UserNotFoundError"> {
  readonly _tag = "UserNotFoundError" as const;

  constructor(readonly userId: string) {
    super(`User ${userId} was not found`);
  }
}

function findUser(id: string): Result<User, UserNotFoundError> {
  return id === "u_123"
    ? ok({ id, name: "Ada" })
    : err(new UserNotFoundError(id));
}
```

You may extend `Error` directly instead. Conformance to `ResultError` only requires an `Error` with a string `_tag`; a readonly literal property is recommended because it preserves the precise tag needed for exhaustive narrowing.

## 3. Narrow both layers

```typescript
const result = findUser("missing");

if (isErr(result)) {
  switch (result.error._tag) {
    case "UserNotFoundError":
      console.error(result.error.userId);
      break;
    default: {
      const exhaustive: never = result.error;
      throw exhaustive;
    }
  }
} else {
  console.log(result.value.name);
}
```

`isErr` narrows the outer `Result`; the error's `_tag` then narrows an error union. The exhaustive branch makes a newly added error variant a compile-time decision point.

## 4. Compose without throwing

```typescript
import { flatMap, map } from "@alt-stack/result";

const displayName = map(findUser("u_123"), (user) => user.name.toUpperCase());

const loadedProfile = flatMap(findUser("u_123"), (user) =>
  ok({ user, preferences: { theme: "dark" as const } }),
);
```

`map` transforms only an `Ok` value. `flatMap` short-circuits an existing `Err` and adds the callback's error type to the returned union.

## What to read next

- [Result common patterns](./common-patterns.md) for async boundaries, recovery, collections, and side effects.
- [Result API Documentation](./api.md) for every exported type and function.

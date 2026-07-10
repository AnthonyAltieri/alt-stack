# `@alt-stack/result`

Typed success and expected failure values for Altstack and standalone TypeScript applications.

## Install

```bash
pnpm add @alt-stack/result
```

The implementation has no runtime dependency. Its manifest declares Zod 4 as an optional peer for ecosystem compatibility.

## Quickstart

```typescript
import {
  TaggedError,
  err,
  isErr,
  ok,
  type Result,
} from "@alt-stack/result";

class MissingUserError extends TaggedError<"MissingUserError"> {
  readonly _tag = "MissingUserError" as const;

  constructor(readonly userId: string) {
    super(`User ${userId} was not found`);
  }
}

function loadUser(id: string): Result<{ id: string }, MissingUserError> {
  return id === "u_123" ? ok({ id }) : err(new MissingUserError(id));
}

const result = loadUser("missing");
if (isErr(result)) {
  console.error(result.error._tag, result.error.userId);
} else {
  console.log(result.value.id);
}
```

A `Result` has an outer `_tag` of `"Ok"` or `"Err"`. A failure carries an actual `Error` instance with a string `_tag`. A readonly literal tag is not required for `ResultError` conformance, but it enables exhaustive narrowing of an error union. Supplying `TaggedError<"MissingUserError">` makes the base class enforce that exact literal.

## Public surface

- construction and guards: `ok`, `err`, `isOk`, `isErr`;
- composition: `map`, `flatMap`, `mapError`, `catchError`;
- extraction and matching: `unwrap`, defaults, `match`, and `fold`;
- async boundaries: `fromPromise`, `tryCatch`, and `tryCatchAsync`;
- collections and observation: `all`, `firstOk`, `tap`, and `tapError`;
- tagged errors and inference helpers: `TaggedError`, `ResultAggregateError`, `isResultError`, `assertResultError`, and the exported helper types.

## Documentation

- [Quickstart](https://altstack-docs.vercel.app/result/quickstart)
- [Common patterns](https://altstack-docs.vercel.app/result/common-patterns)
- [API Documentation](https://altstack-docs.vercel.app/result/api)

## Development

From the repository root:

```bash
pnpm --filter @alt-stack/result exec vitest run src/result.spec.ts
pnpm --filter @alt-stack/result check-types
pnpm --filter @alt-stack/result build
```

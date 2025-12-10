# Result Type

Handlers return a `Result<A, E>` type for explicit error handling, powered by `@alt-stack/result`.

For comprehensive documentation on the Result type, see the [Result documentation](/result).

## Overview

The Result type makes errors explicit in your type signatures. Instead of throwing exceptions, handlers return `Result` types that are either `Ok` (success) or `Err` (failure).

```typescript
import { ok, err, TaggedError } from "@alt-stack/server-hono";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly resourceId: string) {
    super(`Resource ${resourceId} not found`);
  }
}

// Success: wrap value in ok()
return ok({ id: "123", name: "John" });

// Error: wrap error in err()
return err(new NotFoundError("123"));
```

## Defining Error Classes

Define your error classes using `TaggedError`:

```typescript
import { TaggedError } from "@alt-stack/result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly resourceId: string) {
    super(`Resource ${resourceId} not found`);
  }
}

class ForbiddenError extends TaggedError {
  readonly _tag = "ForbiddenError";
  constructor(public readonly message: string = "Access denied") {
    super(message);
  }
}
```

## Basic Usage

### Returning Success

Use `ok()` to return successful values:

```typescript
const handler = procedure
  .output(z.object({ id: z.string(), name: z.string() }))
  .get(({ input }) => {
    const user = { id: "123", name: "John" };
    return ok(user);
  });
```

### Returning Errors

Use `err()` to return typed errors:

```typescript
class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly resourceId: string) {
    super(`Resource ${resourceId} not found`);
  }
}

const handler = procedure
  .output(UserSchema)
  .errors({
    404: z.object({
      _tag: z.literal("NotFoundError"),
      resourceId: z.string(),
    }),
  })
  .get(({ input }) => {
    const user = findUser(input.params.id);

    if (!user) {
      return err(new NotFoundError(input.params.id));
    }

    return ok(user);
  });
```

## Error Schema Requirements

Error schemas **must** include a `_tag` field with a `z.literal()` value:

```typescript
// ✅ Valid - has _tag literal
.errors({
  404: z.object({
    _tag: z.literal("NotFoundError"),
    resourceId: z.string(),
  }),
})

// ❌ Invalid - missing _tag (compile error)
.errors({
  404: z.object({
    message: z.string(),
  }),
})

// ❌ Invalid - _tag is string, not literal (compile error)
.errors({
  404: z.object({
    _tag: z.string(),
    message: z.string(),
  }),
})
```

## Type Inference

Error types are inferred from your `.errors()` definitions. TypeScript ensures you can only return errors that match declared schemas:

```typescript
class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly resourceId: string) {
    super(`Not found: ${resourceId}`);
  }
}

class ConflictError extends TaggedError {
  readonly _tag = "ConflictError";
  constructor(public readonly message: string) {
    super(message);
  }
}

procedure
  .errors({
    404: z.object({ _tag: z.literal("NotFoundError"), resourceId: z.string() }),
    409: z.object({ _tag: z.literal("ConflictError"), message: z.string() }),
  })
  .get(({ input }) => {
    // TypeScript knows errors must match 404 or 409 schemas
    if (!exists) {
      return err(new NotFoundError(input.params.id)); // ✅ Compiles
    }
    if (conflict) {
      return err(new ConflictError("Already exists")); // ✅ Compiles
    }
    return ok(result);
  });
```

## Result Utilities

The server packages re-export Result utilities from `@alt-stack/result`:

### Type Guards

```typescript
import { isOk, isErr } from "@alt-stack/server-hono";

const result = await handler();
if (isOk(result)) {
  console.log(result.value);
}
if (isErr(result)) {
  console.log(result.error);
}
```

### Pattern Matching

```typescript
import { match } from "@alt-stack/server-hono";

const message = match(result, {
  ok: (value) => `Success: ${value.name}`,
  err: (error) => `Error: ${error.message}`,
});
```

### Transformations

```typescript
import { map, flatMap, mapError } from "@alt-stack/server-hono";

// Transform success value
const mapped = map(result, (user) => user.name);

// Chain operations
const chained = flatMap(result, (user) => {
  if (!user.active) return err(new ForbiddenError("Inactive user"));
  return ok(user.profile);
});

// Transform error
const withNewError = mapError(result, (e) => ({ ...e, logged: true }));
```

### Extraction

```typescript
import { unwrap, unwrapOr } from "@alt-stack/server-hono";

// Get value or throw (use sparingly)
const value = unwrap(result);

// Get value or default
const valueOrDefault = unwrapOr(result, defaultUser);
```

### Try-Catch Wrappers

```typescript
import { tryCatch, tryCatchAsync } from "@alt-stack/server-hono";

class ParseError extends TaggedError {
  readonly _tag = "ParseError";
  constructor(public readonly message: string) {
    super(message);
  }
}

// Wrap sync function
const result = tryCatch(
  () => JSON.parse(input),
  (e) => new ParseError("Invalid JSON")
);

// Wrap async function
const asyncResult = await tryCatchAsync(
  () => fetchUser(id),
  (e) => new FetchError(String(e))
);
```

## Middleware

Middleware can return `err()` just like handlers. Define errors with `.errors()` before `.use()`:

```typescript
class UnauthorizedError extends TaggedError {
  readonly _tag = "UnauthorizedError";
  constructor(public readonly message: string = "Authentication required") {
    super(message);
  }
}

const protectedProcedure = procedure
  .errors({
    401: z.object({
      _tag: z.literal("UnauthorizedError"),
      message: z.string(),
    }),
  })
  .use(async ({ ctx, next }) => {
    if (!ctx.user) {
      return err(new UnauthorizedError());
    }
    return next({ ctx: { user: ctx.user } });
  });
```

## See Also

- [Result Documentation](/result) - Complete guide to the Result type
- [Error Handling](./error-handling) - Defining error schemas

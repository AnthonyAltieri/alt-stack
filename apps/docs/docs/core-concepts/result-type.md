# Result Type

Handlers return a `Result<A, E>` type for explicit error handling, powered by `@alt-stack/result`.

For comprehensive documentation on the Result type, see the [Result documentation](/result).

## Overview

The Result type makes errors explicit in your type signatures. Instead of throwing exceptions, handlers return `Result` types that are either `Ok` (success) or `Err` (failure).

```typescript
import { ok, err } from "@alt-stack/server-hono";
// Or import directly: import { ok, err } from "@alt-stack/result";

// Success: wrap value in ok()
return ok({ id: "123", name: "John" });

// Error: wrap error in err() with _httpCode for status
return err({ _httpCode: 404, data: { error: { code: "NOT_FOUND", message: "User not found" } } });
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

Use `err()` to return typed errors. Include `_httpCode` to set the HTTP status code:

```typescript
const handler = procedure
  .output(UserSchema)
  .errors({
    404: z.object({
      error: z.object({
        code: z.literal("NOT_FOUND"),
        message: z.string(),
      }),
    }),
  })
  .get(({ input }) => {
    const user = findUser(input.params.id);

    if (!user) {
      return err({
        _httpCode: 404 as const,
        data: {
          error: {
            code: "NOT_FOUND" as const,
            message: `User ${input.params.id} not found`,
          },
        },
      });
    }

    return ok(user);
  });
```

## Error Structure

Server errors have two fields:
- `_httpCode`: HTTP status code (e.g., 404, 500)
- `data`: The error payload matching your error schema

```typescript
return err({
  _httpCode: 400 as const,
  data: {
    error: {
      code: "VALIDATION_ERROR" as const,
      message: "Invalid input",
    },
  },
});
```

## Type Inference

Error types are inferred from your `.errors()` definitions. TypeScript ensures you can only return errors that match defined schemas:

```typescript
procedure
  .errors({
    404: z.object({ error: z.object({ code: z.literal("NOT_FOUND"), message: z.string() }) }),
    409: z.object({ error: z.object({ code: z.literal("CONFLICT"), message: z.string() }) }),
  })
  .get(({ input }) => {
    // TypeScript knows errors must match 404 or 409 schemas
    if (!exists) {
      return err({ _httpCode: 404 as const, data: { error: { code: "NOT_FOUND" as const, message: "Not found" } } });
    }
    if (conflict) {
      return err({ _httpCode: 409 as const, data: { error: { code: "CONFLICT" as const, message: "Already exists" } } });
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
  err: (error) => `Error: ${error.data.error.message}`,
});
```

### Transformations

```typescript
import { map, flatMap, mapError } from "@alt-stack/server-hono";

// Transform success value
const mapped = map(result, (user) => user.name);

// Chain operations
const chained = flatMap(result, (user) => {
  if (!user.active) return err({ _httpCode: 403 as const, data: { message: "Inactive" } });
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

// Wrap sync function
const result = tryCatch(
  () => JSON.parse(input),
  (e) => ({ _httpCode: 400 as const, data: { message: "Invalid JSON" } })
);

// Wrap async function
const asyncResult = await tryCatchAsync(
  () => fetchUser(id),
  (e) => ({ _httpCode: 500 as const, data: { error: { code: "FETCH_ERROR", message: String(e) } } })
);
```

## Middleware

Middleware can return `err()` just like handlers. Define errors with `.errors()` before `.use()`:

```typescript
const protectedProcedure = procedure
  .errors({
    401: z.object({
      error: z.object({
        code: z.literal("UNAUTHORIZED"),
        message: z.string(),
      }),
    }),
  })
  .use(async ({ ctx, next }) => {
    if (!ctx.user) {
      return err({
        _httpCode: 401 as const,
        data: {
          error: {
            code: "UNAUTHORIZED" as const,
            message: "Authentication required",
          },
        },
      });
    }
    return next({ ctx: { user: ctx.user } });
  });
```

## See Also

- [Result Documentation](/result) - Complete guide to the Result type
- [Error Handling](./error-handling) - Defining error schemas

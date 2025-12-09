# Result Type

Handlers return a `Result<E, A>` type for explicit error handling, inspired by Effect-TS.

## Overview

The `@alt-stack/result` package provides a type-safe way to handle errors in handlers. Instead of throwing exceptions, handlers return `Result` types that make errors explicit in the type system.

```typescript
import { ok, err, type Result } from "@alt-stack/server-hono";

// Success: wrap value in ok()
return ok({ id: "123", name: "John" });

// Error: wrap error in err()
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

Errors have two optional tags:
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
  .handler(({ input }) => {
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

The result package includes utility functions:

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
  if (!user.active) return err({ _code: 1, data: { message: "Inactive" } });
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
  (e) => ({ _code: 1, data: { message: "Invalid JSON" } })
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

Handlers also return Result types:

```typescript
const handler = protectedProcedure.get(({ ctx }) => {
  return ok({ user: ctx.user });
});
```

## Kafka/Workers Result

For Kafka and Workers, use `InferMessageErrors` instead of HTTP codes:

```typescript
import { ok, err } from "@alt-stack/kafka-core";

const handler = procedure
  .errors({
    INVALID_USER: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
  })
  .subscribe(({ input }) => {
    if (!input.userId) {
      return err({ data: { error: { code: "INVALID_USER", message: "User ID required" } } });
    }
    return ok(undefined);
  });
```

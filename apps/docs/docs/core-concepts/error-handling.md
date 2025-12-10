# Error Handling

Define error schemas and use `ok()` / `err()` for type-safe error responses with the Result pattern.

For comprehensive documentation on the Result type, see the [Result documentation](/result).

## Error Schema Requirements

Error schemas **must** include a `_tag` field with a `z.literal()` value. This enables:

1. **Compile-time validation** - TypeScript errors if `_tag` is missing
2. **Handler type safety** - Only errors with declared `_tag` values can be returned
3. **Discriminated unions** - Consumers can switch on `_tag` for exhaustive error handling

### Valid Error Schema

```typescript
.errors({
  403: z.object({
    _tag: z.literal("ForbiddenError"),
    message: z.string(),
  }),
  404: z.object({
    _tag: z.literal("NotFoundError"),
    resourceId: z.string(),
  }),
})
```

### Invalid - Compile Error

```typescript
// Missing _tag field - compile error
.errors({
  403: z.object({ message: z.string() }),
})

// _tag is string, not literal - compile error
.errors({
  403: z.object({ _tag: z.string(), message: z.string() }),
})
```

## Defining Error Classes

Define your own error classes using `TaggedError` from `@alt-stack/result`:

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

## Defining Error Schemas

Specify error schemas using `.errors()`:

```typescript
import { init, router, ok, err, TaggedError } from "@alt-stack/server-hono";
import { z } from "zod";

// Define your error class
class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly resourceId: string) {
    super(`Resource ${resourceId} not found`);
  }
}

const factory = init();

const userRouter = router({
  "{id}": factory.procedure
    .input({
      params: z.object({ id: z.string() }),
    })
    .output(z.object({ id: z.string(), name: z.string() }))
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
    }),
});
```

## Multiple Error Types

Define multiple error status codes:

```typescript
class ValidationError extends TaggedError {
  readonly _tag = "ValidationError";
  constructor(public readonly message: string) {
    super(message);
  }
}

class ConflictError extends TaggedError {
  readonly _tag = "ConflictError";
  constructor(public readonly message: string) {
    super(message);
  }
}

const userRouter = router({
  "/": factory.procedure
    .input({
      body: z.object({ email: z.string().email() }),
    })
    .output(z.object({ id: z.string() }))
    .errors({
      400: z.object({
        _tag: z.literal("ValidationError"),
        message: z.string(),
      }),
      409: z.object({
        _tag: z.literal("ConflictError"),
        message: z.string(),
      }),
    })
    .post(({ input }) => {
      if (userExists(input.body.email)) {
        return err(new ConflictError("User already exists"));
      }

      const user = createUser(input.body);
      return ok({ id: user.id });
    }),
});
```

## Handler Must Return Matching Tags

TypeScript enforces that handlers only return errors with `_tag` values declared in `.errors()`:

```typescript
procedure
  .errors({
    403: z.object({ _tag: z.literal("ForbiddenError"), message: z.string() }),
  })
  .get(async () => {
    return err(new ForbiddenError("Access denied")); // ✅ Compiles
    return err(new NotFoundError("123"));            // ❌ Type error: "NotFoundError" not in declared tags
  });
```

## Validation Errors

Input validation errors are automatic. When validation fails, a `400` response is returned:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [...]
  }
}
```

## Middleware Errors

Middleware can return `err()` just like handlers. Define errors with `.errors()` before `.use()`:

```typescript
class UnauthorizedError extends TaggedError {
  readonly _tag = "UnauthorizedError";
  constructor(public readonly message: string = "Authentication required") {
    super(message);
  }
}

const protectedProcedure = factory.procedure
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
- [Result Type](./result-type) - Server-specific Result usage

# Error Handling

Define error schemas and use `ok()` / `err()` for type-safe error responses with the Result pattern.

## Defining Error Schemas

Specify error schemas using `.errors()`:

```typescript
import { init, router, ok, err } from "@alt-stack/server-hono";

const factory = init();

const userRouter = router({
  "{id}": factory.procedure
    .input({
      params: z.object({ id: z.string() }),
    })
    .output(z.object({ id: z.string(), name: z.string() }))
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
        // Return error with _httpCode for status code
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
    }),
});
```

## Multiple Error Types

Define multiple error status codes:

```typescript
const userRouter = router({
  "/": factory.procedure
    .input({
      body: z.object({ email: z.string().email() }),
    })
    .output(z.object({ id: z.string() }))
    .errors({
      400: z.object({
        error: z.object({
          code: z.literal("VALIDATION_ERROR"),
          message: z.string(),
        }),
      }),
      409: z.object({
        error: z.object({
          code: z.literal("CONFLICT"),
          message: z.string(),
        }),
      }),
    })
    .post(({ input }) => {
      if (userExists(input.body.email)) {
        return err({
          _httpCode: 409 as const,
          data: {
            error: {
              code: "CONFLICT" as const,
              message: "User already exists",
            },
          },
        });
      }

      const user = createUser(input.body);
      return ok({ id: user.id });
    }),
});
```

## HTTP Status Codes

The `_httpCode` field determines the HTTP response status:

```typescript
return err({
  _httpCode: 404 as const,  // Sets HTTP status to 404
  data: { error: { code: "NOT_FOUND" as const, message: "Not found" } },
});
```

Without `_httpCode`, errors default to 500.

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
const protectedProcedure = factory.procedure
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

- [Result Type](./result-type) - Complete guide to Result utilities

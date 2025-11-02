# Error Handling

Define error schemas and use type-safe `ctx.throw()` for controlled error responses.

## Defining Error Schemas

Specify error schemas in the route configuration:

```typescript
const router = createRouter()
  .get("/users/{id}", {
    input: {
      params: z.object({
        id: z.string(),
      }),
    },
    output: z.object({
      id: z.string(),
      name: z.string(),
    }),
    errors: {
      404: z.object({
        error: z.object({
          code: z.literal("NOT_FOUND"),
          message: z.string(),
        }),
      }),
    },
  })
  .handler((ctx) => {
    const user = findUser(ctx.input.id);
    
    if (!user) {
      // TypeScript knows this must match the 404 error schema
      // Status code is automatically inferred from the error type
      ctx.throw({
        error: {
          code: "NOT_FOUND",
          message: `User ${ctx.input.id} not found`,
        },
      });
    }
    
    return user;
  });
```

## Multiple Error Types

Define multiple error status codes:

```typescript
const router = createRouter()
  .post("/users", {
    input: {
      body: z.object({
        name: z.string(),
      }),
    },
    output: z.object({
      id: z.string(),
    }),
    errors: {
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
    },
  })
  .handler((ctx) => {
    if (userExists(ctx.input.name)) {
      ctx.throw({
        error: {
          code: "CONFLICT",
          message: "User already exists",
        },
      });
    }
    
    return { id: "1" };
  });
```

## Automatic Status Codes

The status code is automatically inferred from the error type in `ctx.throw()`. You don't need to specify it manually - TypeScript ensures you can only throw errors that match your defined schemas.

## Validation Errors

When input validation fails, a `400` response is automatically returned:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [...]
  }
}
```

You don't need to handle validation errors manually - they're caught before your handler runs.


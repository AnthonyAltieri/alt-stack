# Input Validation

Automatic validation of path parameters, query parameters, and request body using Zod schemas.

## Validation Sources

Inputs can be validated from three sources:

- **params**: Path parameters (e.g., `/users/{id}`)
- **query**: Query string parameters (e.g., `?limit=10&offset=0`)
- **body**: Request body for POST/PUT/PATCH requests

## Example

```typescript
const router = createRouter()
  .get("/users/{id}", {
    input: {
      params: z.object({
        id: z.string(),
      }),
      query: z.object({
        limit: z.number().optional(),
        offset: z.number().optional(),
      }),
    },
    output: z.object({
      id: z.string(),
    }),
  })
  .handler((ctx) => {
    // ctx.input.id (from params)
    // ctx.input.limit (from query)
    // ctx.input.offset (from query)
    return { id: ctx.input.id };
  });
```

## Validation Errors

When validation fails, a `400` response is automatically returned:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [...]
  }
}
```

The handler is only called if all inputs pass validation, ensuring type safety and runtime safety.


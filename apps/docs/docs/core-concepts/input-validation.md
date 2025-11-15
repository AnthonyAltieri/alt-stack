# Input Validation

Automatic validation of path parameters, query parameters, and request body using Zod schemas.

## Validation Sources

Inputs can be validated from three sources:

- **params**: Path parameters (e.g., `/users/{id}`)
- **query**: Query string parameters (e.g., `?limit=10&offset=0`)
- **body**: Request body for POST/PUT/PATCH requests

## Example

```typescript
import { router, publicProcedure } from "@alt-stack/server";
import { z } from "zod";

export const userRouter = router({
  "{id}": publicProcedure
    .input({
      params: z.object({
        id: z.string(),
      }),
      query: z.object({
        limit: z.number().optional(),
        offset: z.number().optional(),
      }),
    })
    .output(
      z.object({
        id: z.string(),
      })
    )
    .get((opts) => {
      // opts.input.id (from params)
      // opts.input.limit (from query)
      // opts.input.offset (from query)
      const { input } = opts;
      return { id: input.id };
    }),
});
```

## Path Parameter Validation

When using path parameters in the route key (e.g., `{id}`), TypeScript enforces that you must provide a `params` schema with matching keys:

```typescript
import { router, publicProcedure } from "@alt-stack/server";
import { z } from "zod";

export const userRouter = router({
  // ✅ Valid - params.id matches {id} in path
  "{id}": publicProcedure
    .input({
      params: z.object({
        id: z.string(),
      }),
    })
    .get((opts) => {
      return { id: opts.input.id };
    }),

  // ❌ TypeScript error - missing params.id for {id} path
  // "{id}": publicProcedure.get(() => ({ id: "1" })),
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

## Combining Input Types

You can combine params, query, and body validation:

```typescript
import { router, publicProcedure } from "@alt-stack/server";
import { z } from "zod";

export const userRouter = router({
  "{id}": publicProcedure
    .input({
      params: z.object({
        id: z.string(),
      }),
      query: z.object({
        include: z.enum(["profile", "posts"]).optional(),
      }),
      body: z.object({
        name: z.string().min(1),
        email: z.string().email(),
      }),
    })
    .put((opts) => {
      const { input } = opts;
      // All inputs are validated and typed:
      // input.id (from params)
      // input.include (from query, optional)
      // input.name, input.email (from body)
      return { id: input.id };
    }),
});
```

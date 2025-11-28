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
        limit: z.coerce.number().optional(),
        offset: z.coerce.number().optional(),
      }),
    })
    .output(
      z.object({
        id: z.string(),
      })
    )
    .get((opts) => {
      // opts.input.params.id (from params)
      // opts.input.query.limit (from query)
      // opts.input.query.offset (from query)
      const { input } = opts;
      return { id: input.params.id };
    }),
});
```

## String Input Constraints

Since HTTP path parameters and query strings are always strings, `params` and `query` schemas are constrained at **compile-time** to only accept Zod types that can parse string input. This prevents runtime errors from invalid schema configurations.

| Schema | Input Type | Allowed in params/query? |
|--------|-----------|--------------------------|
| `z.string()` | `string` | ✅ |
| `z.enum(["a", "b"])` | `"a" \| "b"` | ✅ (string literals) |
| `z.coerce.number()` | `unknown` | ✅ (coerces strings) |
| `z.string().transform(...)` | `string` | ✅ (transform) |
| `z.codec(z.string(), ...)` | `string` | ✅ (Zod 4 codec) |
| `z.number()` | `number` | ❌ compile error |
| `z.boolean()` | `boolean` | ❌ compile error |
| `z.array(...)` | `T[]` | ❌ compile error |

```typescript
// ✅ Valid - all fields accept string input
.input({
  params: z.object({ id: z.string() }),
  query: z.object({ page: z.coerce.number() }),
})

// ❌ Compile error - z.number() doesn't accept string input
.input({
  query: z.object({ page: z.number() }), // Error!
})
```

:::tip Use z.coerce for numeric parameters
Since query strings are always strings, use `z.coerce.number()` instead of `z.number()` to automatically convert string values like `"42"` to numbers.
:::

### Zod 4 Codecs

[Zod 4 codecs](https://zod.dev/codecs) provide bidirectional transformation between input and output types. They work seamlessly with params/query since the input schema determines what the field accepts:

```typescript
// Define a codec that transforms ISO strings to Date objects
const stringToDate = z.codec(
  z.iso.datetime(),  // input schema: ISO date string
  z.date(),          // output schema: Date object
  {
    decode: (isoString) => new Date(isoString),
    encode: (date) => date.toISOString(),
  }
);

// ✅ Valid - input type is string (from z.iso.datetime())
.input({
  query: z.object({
    since: stringToDate, // Accepts: "2024-01-15T10:30:00.000Z"
  }),
})
.get(({ input }) => {
  // input.query.since is typed as Date (the output type)
  const date: Date = input.query.since;
  return { events: getEventsSince(date) };
})
```

:::note Body has no string constraint
The `body` field has no string input constraint since request bodies are parsed as JSON and can contain any JSON-serializable types.
:::

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
      return { id: opts.input.params.id };
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
      // input.params.id (from params)
      // input.query.include (from query, optional)
      // input.body.name, input.body.email (from body)
      return { id: input.params.id };
    }),
});
```

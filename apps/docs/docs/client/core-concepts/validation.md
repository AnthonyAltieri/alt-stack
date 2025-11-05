# Validation

The client automatically validates request parameters, query strings, and request bodies using Zod schemas.

## Automatic Validation

When you make a request, the client automatically validates:

1. **Path parameters** - Validated against the `params` schema
2. **Query parameters** - Validated against the `query` schema
3. **Request body** - Validated against the `body` schema
4. **Response data** - Validated against the `output` schema

```typescript
const result = await client.post("/users", {
  body: {
    name: "Alice",
    email: "invalid-email", // ❌ This will throw ValidationError
  },
});
```

## Validation Errors

If validation fails, the client throws a `ValidationError`:

```typescript
import { ValidationError } from "@alt-stack/client";

try {
  await client.get("/users/{id}", {
    params: { id: 123 }, // ❌ Should be string
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error("Validation failed:", error.message);
    console.error("Details:", error.details);
  }
}
```

The `ValidationError` includes:
- `message`: Human-readable error message
- `details`: Validation error details from Zod
- `endpoint`: The endpoint that failed validation
- `method`: The HTTP method that failed validation

## Type Safety

TypeScript ensures you pass the correct types at compile time:

```typescript
// ✅ TypeScript knows this is correct
await client.get("/users/{id}", {
  params: { id: "123" },
});

// ❌ TypeScript error - id must be string
await client.get("/users/{id}", {
  params: { id: 123 },
});
```

## Response Validation

Response data is automatically validated when received:

```typescript
const result = await client.get("/users/{id}", {
  params: { id: "123" },
});

if (result.success) {
  // result.data is validated and typed
  console.log(result.data.name); // ✅ Type-safe
}
```

If the response doesn't match the expected schema, an error is returned in the result.


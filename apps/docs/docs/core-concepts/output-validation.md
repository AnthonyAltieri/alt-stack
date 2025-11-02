# Output Validation

Optionally validate response data to ensure handlers return the expected structure.

## Basic Usage

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
  })
  .handler((ctx) => {
    // Return value is validated against output schema
    return {
      id: ctx.input.id,
      name: "Alice",
    };
  });
```

## Benefits

- **Runtime safety**: Catch bugs during development when handlers return incorrect data
- **Type safety**: TypeScript ensures your return value matches the schema
- **Documentation**: Output schemas serve as API documentation

## Optional Output Validation

Output validation is optional. If you omit the `output` field, no validation is performed, but you lose type safety for the return value:

```typescript
const router = createRouter()
  .get("/users/{id}", {
    input: {
      params: z.object({
        id: z.string(),
      }),
    },
    // No output validation
  })
  .handler((ctx) => {
    return { id: ctx.input.id };
  });
```


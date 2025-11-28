# @alt-stack/server

A lightweight, type-safe server framework built on Hono with Zod validation. Inspired by tRPC's builder pattern, providing full type inference from a central router definition.

## Documentation

📚 **Full documentation is available at:** [Server Framework Docs](./../../apps/docs/)

The documentation website is the source of truth for all documentation. The docs include:

- Getting started guide
- Core concepts (validation, error handling, middleware, etc.)
- Integration guides (Better Auth, CORS, etc.)
- API examples and best practices

## Quick Installation

```bash
pnpm add @alt-stack/server hono zod
# or
npm install @alt-stack/server hono zod
# or
yarn add @alt-stack/server hono zod
```

## Features

- **Type-safe routes**: Full TypeScript inference from Zod schemas
- **Builder pattern**: Fluent API for defining routes with `.get()`, `.post()`, etc.
- **Type-safe errors**: `ctx.throw()` with automatic status code inference from error schemas
- **Middleware support**: Router-level and procedure-level middleware with context extension
- **Router combination**: Merge multiple routers with `.merge()`
- **Validation**: Automatic Zod validation for inputs and optional outputs
- **Lightweight**: Minimal abstraction over Hono - easy to audit and understand

## Input Type Constraints

Since HTTP path parameters and query strings are always strings, `input.params` and `input.query` schemas are constrained at compile-time to only accept Zod types that can parse string input. This prevents runtime errors from invalid schema configurations.

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
  params: z.object({ id: z.number() }), // Error!
})
```

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
  return { timestamp: date.getTime() };
})
```

Note: `input.body` has no string constraint since request bodies are parsed as JSON.

For complete documentation, see the [docs website](./../../apps/docs/).

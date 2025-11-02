# Basic Routes

Define routes using the fluent builder API with support for all HTTP methods.

## Route Methods

The router supports all standard HTTP methods:

```typescript
const router = createRouter()
  .get("/users", { /* config */ })
  .post("/users", { /* config */ })
  .put("/users/{id}", { /* config */ })
  .patch("/users/{id}", { /* config */ })
  .delete("/users/{id}", { /* config */ });
```

## Path Parameters

Extract parameters from the URL path:

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
    // ctx.input.id is typed as string
    return {
      id: ctx.input.id,
      name: "Alice",
    };
  });
```

## Query Parameters

Extract query string parameters:

```typescript
const router = createRouter()
  .get("/users", {
    input: {
      query: z.object({
        limit: z.number().optional(),
        offset: z.number().optional(),
        search: z.string().optional(),
      }),
    },
    output: z.array(z.object({
      id: z.string(),
      name: z.string(),
    })),
  })
  .handler((ctx) => {
    // ctx.input.limit, ctx.input.offset, ctx.input.search are typed
    return [];
  });
```

## Request Body

Handle POST/PUT/PATCH requests with typed request bodies:

```typescript
const router = createRouter()
  .post("/users", {
    input: {
      body: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
    },
    output: z.object({
      id: z.string(),
      name: z.string(),
    }),
  })
  .handler((ctx) => {
    // ctx.input.name and ctx.input.email are typed
    return {
      id: "1",
      name: ctx.input.name,
    };
  });
```

## Combining Input Sources

You can combine params, query, and body:

```typescript
const router = createRouter()
  .put("/users/{id}", {
    input: {
      params: z.object({
        id: z.string(),
      }),
      query: z.object({
        notify: z.boolean().optional(),
      }),
      body: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
    },
    output: z.object({
      id: z.string(),
    }),
  })
  .handler((ctx) => {
    // All inputs are available and typed
    // ctx.input.id (from params)
    // ctx.input.notify (from query)
    // ctx.input.name, ctx.input.email (from body)
    return { id: ctx.input.id };
  });
```


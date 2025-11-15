# Basic Routes

Define routes using the tRPC-style API with support for all HTTP methods.

## Route Methods

The router supports all standard HTTP methods:

```typescript
import { router, publicProcedure } from "@alt-stack/server";
import { z } from "zod";

export const userRouter = router({
  list: publicProcedure.get(() => {
    return [];
  }),
  
  create: publicProcedure.post(() => {
    return { id: "1" };
  }),
  
  update: publicProcedure.put(() => {
    return { id: "1" };
  }),
  
  patch: publicProcedure.patch(() => {
    return { id: "1" };
  }),
  
  remove: publicProcedure.delete(() => {
    return { success: true };
  }),
});
```

## Path Parameters

Extract parameters from the URL path. Path parameters in the route key (e.g., `{id}`) are automatically validated:

```typescript
import { router, publicProcedure } from "@alt-stack/server";
import { z } from "zod";

export const userRouter = router({
  "{id}": publicProcedure
    .input({
      params: z.object({
        id: z.string(),
      }),
    })
    .get((opts) => {
      // opts.input.id is typed as string
      const { input } = opts;
      return {
        id: input.id,
        name: "Alice",
      };
    }),
});
```

**Type Safety**: TypeScript will automatically detect an error if you use a path parameter like `{id}` but don't provide the corresponding `params.id` in your input schema. For example, this would cause a TypeScript error:

```typescript
// ❌ TypeScript error: Missing required path parameter 'id' in params
export const userRouter = router({
  "{id}": publicProcedure.get((opts) => {
    return { id: "1" };
  }),
});
```

You must include `params: z.object({ id: z.string() })` (or the appropriate type) when using `{id}` in your route path.

## Query Parameters

Extract query string parameters:

```typescript
import { router, publicProcedure } from "@alt-stack/server";
import { z } from "zod";

export const userRouter = router({
  list: publicProcedure
    .input({
      query: z.object({
        limit: z.number().optional(),
        offset: z.number().optional(),
        search: z.string().optional(),
      }),
    })
    .get((opts) => {
      // opts.input.limit, opts.input.offset, opts.input.search are typed
      const { input } = opts;
      return [];
    }),
});
```

## Request Body

Handle POST/PUT/PATCH requests with typed request bodies:

```typescript
import { router, publicProcedure } from "@alt-stack/server";
import { z } from "zod";

export const userRouter = router({
  create: publicProcedure
    .input({
      body: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
    })
    .post((opts) => {
      // opts.input.name and opts.input.email are typed
      const { input } = opts;
      return {
        id: "1",
        name: input.name,
      };
    }),
});
```

## Combining Input Sources

You can combine params, query, and body:

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
        notify: z.boolean().optional(),
      }),
      body: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
    })
    .put((opts) => {
      // All inputs are available and typed
      const { input } = opts;
      // input.id (from params)
      // input.notify (from query)
      // input.name, input.email (from body)
      return { id: input.id };
    }),
});
```

## Output Validation

You can specify output schemas for validation:

```typescript
import { router, publicProcedure } from "@alt-stack/server";
import { z } from "zod";

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

export const userRouter = router({
  get: publicProcedure
    .input({
      params: z.object({ id: z.string() }),
    })
    .output(UserSchema)
    .get((opts) => {
      return {
        id: opts.input.id,
        name: "Alice",
        email: "alice@example.com",
      };
    }),
});
```

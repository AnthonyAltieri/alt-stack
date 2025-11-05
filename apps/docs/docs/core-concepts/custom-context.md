# Custom Context

Define custom context (similar to tRPC) to pass data like database connections or authentication info.

## Defining Context

Create a context type and a function to create it:

```typescript
import { init, createServer } from "@alt-stack/server";
import type { Context } from "hono";
import { z } from "zod";

// Define your context type
interface AppContext {
  db: Database;
  user: User | null;
}

// Create context function
async function createContext(c: Context): Promise<AppContext> {
  const user = await getAuthenticatedUser(c);
  return {
    db: database,
    user,
  };
}

// Create factory and router with context type
const factory = init<AppContext>();
const router = factory.router()
  .get("/profile", {
    input: {},
    output: z.object({
      id: z.string(),
      name: z.string(),
    }),
  })
  .handler((ctx) => {
    // ctx.db and ctx.user are typed and available
    if (!ctx.user) {
      return ctx.hono.json({ error: "Unauthorized" }, 401);
    }
    
    return {
      id: ctx.user.id,
      name: ctx.user.name,
    };
  });

// Create server with createContext
const app = createServer({
  users: router,
}, {
  createContext,
});
```

## Accessing Hono Context

Access the raw Hono context for advanced use cases:

```typescript
const factory = init();
const router = factory.router()
  .get("/users/{id}", {
    input: {
      params: z.object({
        id: z.string(),
      }),
    },
    output: z.object({
      id: z.string(),
    }),
  })
  .handler((ctx) => {
    // Access raw Hono context
    const headers = ctx.hono.req.header();
    const ip = ctx.hono.req.header("x-forwarded-for");
    
    return { id: ctx.input.id };
  });
```

The `ctx.hono` property gives you full access to the underlying Hono context for headers, cookies, environment variables, and other advanced features.


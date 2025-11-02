# Better Auth Integration

Integrate Better Auth for authentication with your server framework. Better Auth handles session management, authentication flows, and user management.

## Setup

First, install Better Auth:

```bash
pnpm add better-auth
# or
npm install better-auth
# or
yarn add better-auth
```

Create your Better Auth configuration:

```typescript
// src/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { z } from "zod";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg", // or your database provider
  }),
  emailAndPassword: {
    enabled: true,
  },
  // Add other auth providers as needed
});
```

## Validating User Session with Zod

Better Auth returns session data that should be validated. Use Zod to ensure type safety and validate the user structure:

```typescript
import { z } from "zod";
import { auth } from "./auth.js";

// Define your user schema
const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  // Add other user fields as needed
});

// Schema for Better Auth session
const SessionSchema = z.object({
  user: UserSchema,
  session: z.object({
    id: z.string(),
    userId: z.string(),
    expiresAt: z.date(),
  }),
});

// Infer TypeScript types from Zod schemas
export type User = z.infer<typeof UserSchema>;
export type Session = z.infer<typeof SessionSchema>;

export async function getAuthSession(request: Request): Promise<Session | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  
  // Validate and parse the session with safeParse for optional validation
  const result = SessionSchema.safeParse(session);
  
  if (!result.success) {
    // Log validation errors in development
    if (process.env.NODE_ENV === "development") {
      console.warn("Session validation failed:", result.error);
    }
    return null;
  }
  
  return result.data;
}

// Or if you only need the user:
export async function getAuthUser(request: Request): Promise<User | null> {
  const session = await getAuthSession(request);
  return session?.user ?? null;
}
```

## Mounting Better Auth Routes

Mount Better Auth routes alongside your server framework routes. Better Auth handles all `/api/auth/*` routes:

```typescript
import { Hono } from "hono";
import { createServer } from "@repo/server";
import { auth } from "./auth.js";
import { todosRouter } from "./routes/todos.js";

// Create base Hono app
const app = new Hono();

// Mount Better Auth routes
app.on(["GET", "POST"], "/api/auth/*", async (c) => {
  return auth.handler(c.req.raw);
});

// Mount your server framework routes
const serverApp = createServer({
  todos: todosRouter,
});

app.route("/", serverApp);

export default app;
```

## Adding User to Context

Add the authenticated user to your custom context so it's available in all handlers. Use Zod validation to ensure type safety:

```typescript
import { createServer } from "@repo/server";
import { getAuthUser, type User } from "./auth.js";
import type { Context } from "hono";
import { z } from "zod";

interface AppContext extends Record<string, unknown> {
  user: User | null;
}

async function createContext(c: Context): Promise<AppContext> {
  const user = await getAuthUser(c.req.raw);
  return {
    user,
  };
}

const router = createRouter<AppContext>()
  .get("/profile", {
    input: {},
    output: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
    }),
  })
  .handler((ctx) => {
    if (!ctx.user) {
      return ctx.hono.json({ error: "Unauthorized" }, 401);
    }
    
    // ctx.user is fully typed based on UserSchema
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
    };
  });

const app = createServer({
  users: router,
}, {
  createContext,
});
```


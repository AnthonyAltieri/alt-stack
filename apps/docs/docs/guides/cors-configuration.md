# CORS Configuration

Use the `middleware` option in `createServer` to apply global middleware like CORS and mount external routes like Better Auth, all in one call.

## Recommended: Global CORS with Better Auth

For most applications, applying CORS globally with credentials support works best:

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createServer } from "@alt-stack/server";
import { auth, getAuthUser } from "./auth.js";
import { todosRouter } from "./routes/todos.js";
import type { Context } from "hono";

// Create base app
const app = new Hono();

// Apply CORS globally (must be before routes)
app.use("*", cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["POST", "GET", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true, // Required for Better Auth cookies
  exposeHeaders: ["Set-Cookie"],
}));

// Mount Better Auth routes
app.on(["GET", "POST"], "/api/auth/*", async (c) => {
  return auth.handler(c.req.raw);
});

// Create server framework app with context
interface AppContext extends Record<string, unknown> {
  user: User | null;
}

async function createContext(c: Context): Promise<AppContext> {
  const user = await getAuthUser(c.req.raw);
  return { user };
}

const serverApp = createServer({
  todos: todosRouter,
}, {
  createContext,
});

// Mount server framework routes
app.route("/", serverApp);

export default app;
```

## Using Middleware Option

Use the `middleware` option in `createServer` to apply global middleware like CORS and mount external routes like Better Auth, all in one call:

```typescript
import { cors } from "hono/cors";
import { createServer } from "@alt-stack/server";
import { auth } from "./auth.js";
import { todosRouter } from "./routes/todos.js";

// Create server with CORS and Better Auth routes
const app = createServer(
  {
    todos: todosRouter,
  },
  {
    createContext,
    middleware: {
      // Apply CORS globally
      "*": {
        methods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        handler: cors({
          origin: process.env.CLIENT_URL || "http://localhost:3000",
          allowHeaders: ["Content-Type", "Authorization"],
          allowMethods: ["POST", "GET", "PUT", "PATCH", "DELETE", "OPTIONS"],
          credentials: true, // Required for Better Auth cookies
          exposeHeaders: ["Set-Cookie"],
        }) as any, // Type assertion for CORS middleware
      },
      // Mount Better Auth routes
      "/api/auth/*": {
        methods: ["GET", "POST"],
        handler: async (c) => auth.handler(c.req.raw),
      },
    },
  },
);

export default app;
```

**Key Points:**
- The `"*"` path applies middleware globally to all routes (framework and mounted routes)
- For `"*"` paths, the handler can be a Hono middleware function (like `cors()`) or a regular handler
- Other paths mount specific route handlers (like Better Auth)
- Middleware is applied before framework routes, ensuring CORS headers are set correctly

## Manual Setup

If you need more control, you can still apply CORS manually after `createServer`:

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createServer } from "@alt-stack/server";
import { auth } from "./auth.js";
import { todosRouter } from "./routes/todos.js";

const app = new Hono();

// Apply CORS specifically to Better Auth routes
app.use("/api/auth/*", cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["POST", "GET", "OPTIONS"],
  credentials: true,
}));

// Mount Better Auth routes
app.on(["GET", "POST"], "/api/auth/*", async (c) => {
  return auth.handler(c.req.raw);
});

// Create and mount server framework routes
const serverApp = createServer({
  todos: todosRouter,
}, {
  createContext,
});

app.route("/", serverApp);

export default app;
```

## CORS Only for Server Framework Routes

Apply CORS to server framework routes only:

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createServer } from "@alt-stack/server";
import { auth } from "./auth.js";
import { todosRouter } from "./routes/todos.js";

// Create server framework app
const serverApp = createServer({
  todos: todosRouter,
}, {
  createContext,
});

// Apply CORS to server framework routes
serverApp.use("*", cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["POST", "GET", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
}));

const app = new Hono();

// Mount Better Auth routes (no CORS needed if same origin)
app.on(["GET", "POST"], "/api/auth/*", async (c) => {
  return auth.handler(c.req.raw);
});

// Mount server framework routes with CORS
app.route("/", serverApp);

export default app;
```


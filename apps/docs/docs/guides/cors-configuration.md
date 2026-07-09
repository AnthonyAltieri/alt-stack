# CORS Configuration

Use `requestMiddleware` in `createServer` to apply Alt Stack request middleware, and `externalRoutes` to mount non-Alt-Stack handlers like Better Auth.

## Recommended: Global CORS with Better Auth

For most applications, applying CORS globally with credentials support works best:

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createServer } from "@alt-stack/server-hono";
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

## Using createServer Request Middleware

Use `requestMiddleware` to apply CORS before your Alt Stack routes, and `externalRoutes` to mount Better Auth routes without passing raw Hono middleware into `createServer`:

```typescript
import { createServer } from "@alt-stack/server-hono";
import { auth } from "./auth.js";
import { todosRouter } from "./routes/todos.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.CLIENT_URL || "http://localhost:3000",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, GET, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Expose-Headers": "Set-Cookie",
};

function withCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Create server with CORS and Better Auth routes
const app = createServer(
  {
    todos: todosRouter,
  },
  {
    createContext,
    requestMiddleware: [
      // Apply CORS globally
      async ({ request }, next) => {
        if (request.method === "OPTIONS") {
          return new Response(null, { status: 204, headers: corsHeaders });
        }

        return withCorsHeaders(await next());
      },
    ],
    externalRoutes: [
      // Mount Better Auth routes
      {
        path: "/api/auth/*",
        methods: ["GET", "POST"],
        handler: ({ request }) => auth.handler(request),
      },
    ],
  },
);

export default app;
```

**Key Points:**
- `requestMiddleware` runs before external routes and framework routes
- Middleware must return a `Response`; use `return next()` to continue
- `externalRoutes` mounts specific route handlers like Better Auth
- Raw Hono middleware can still be used by composing a Hono app manually outside `createServer`

## Manual Setup

If you need more control, you can still apply CORS manually after `createServer`:

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createServer } from "@alt-stack/server-hono";
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
import { createServer } from "@alt-stack/server-hono";
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

# OpenAPI Documentation

Automatically generate and serve OpenAPI 3.0 documentation for your API using Zod 4's native `toJSONSchema()` function.

## Quick Start

Use `createDocsRouter` to automatically generate and serve OpenAPI documentation:

```typescript
import { init, createServer, createDocsRouter } from "@alt-stack/server";
import { z } from "zod";

const factory = init();
const apiRouter = factory.router()
  .get("/users/{id}", {
    input: {
      params: z.object({
        id: z.string(),
      }),
    },
    output: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email(),
    }),
  })
  .handler((ctx) => ({
    id: ctx.input.id,
    name: "Alice",
    email: "alice@example.com",
  }))
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
  .handler((ctx) => ({
    id: "1",
    name: ctx.input.name,
  }));

// Create docs router
const docsRouter = createDocsRouter(
  { api: apiRouter },
  {
    title: "My API",
    version: "1.0.0",
    description: "API documentation",
  }
);

// Mount both routers
const app = createServer({
  api: apiRouter,
  docs: docsRouter,
});
```

Now you can access:
- OpenAPI JSON spec at `/docs/openapi.json` (path determined by mount prefix `docs`)
- Interactive Swagger UI at `/docs` (path determined by mount prefix `docs`)

## Basic Usage

The `createDocsRouter` function takes the same router configuration as `createServer`, allowing it to automatically discover all your routes and generate complete OpenAPI documentation.

```typescript
import { init, createDocsRouter } from "@alt-stack/server";

const factory = init();
const router = factory.router()
  .get("/items", {
    input: {},
    output: z.array(z.object({ id: z.string() })),
  })
  .handler(() => []);

const docsRouter = createDocsRouter({ api: router });
```

## Customization Options

Customize paths, metadata, and enable/disable features:

```typescript
const docsRouter = createDocsRouter(
  { api: router },
  {
    // OpenAPI metadata
    title: "Todo API",
    version: "2.0.0",
    description: "A simple todo API",
    
    // Custom OpenAPI spec path
    openapiPath: "openapi.json", // Default: "openapi.json"
    // Note: The docs path is determined by the router prefix when mounting in createServer
    
    // Enable/disable interactive docs
    enableDocs: true, // Default: true
  }
);
```

## Integration with createServer

The docs router integrates seamlessly with `createServer`:

```typescript
import { init, createServer, createDocsRouter } from "@alt-stack/server";

const factory = init();
const todosRouter = factory.router()
  .get("/", {
    input: {},
    output: z.array(z.object({ id: z.string(), title: z.string() })),
  })
  .handler(() => []);

const docsRouter = createDocsRouter(
  { todos: todosRouter },
  {
    title: "Todo API",
    version: "1.0.0",
  }
);

const app = createServer({
  todos: todosRouter,
  docs: docsRouter,
});
```

With this setup:
- API routes are available at `/todos/*`
- Documentation is available at `/docs/*`

## Manual OpenAPI Spec Generation

If you need the OpenAPI spec object directly (e.g., for external tools or custom documentation), use `generateOpenAPISpec`:

```typescript
import { generateOpenAPISpec } from "@alt-stack/server";

const spec = generateOpenAPISpec(
  { api: router },
  {
    title: "My API",
    version: "1.0.0",
    description: "API documentation",
  }
);

// Use the spec with external tools
console.log(JSON.stringify(spec, null, 2));
```

## What Gets Documented

The OpenAPI documentation automatically includes:

- **All routes** from your routers
- **Path parameters** (e.g., `/{id}`)
- **Query parameters** from query schemas
- **Request bodies** for POST/PUT/PATCH operations
- **Response schemas** from output schemas
- **Error responses** from error schemas
- **Operation IDs** automatically generated from route paths

## Example: Complete API Documentation

Here's a complete example with multiple route types:

```typescript
import { init, createServer, createDocsRouter } from "@alt-stack/server";
import { z } from "zod";

const factory = init();
const router = factory.router()
  // GET with path and query params
  .get("/users/{id}", {
    input: {
      params: z.object({
        id: z.string(),
      }),
      query: z.object({
        include: z.string().optional(),
      }),
    },
    output: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }),
    errors: {
      404: z.object({
        error: z.object({
          code: z.literal("NOT_FOUND"),
          message: z.string(),
        }),
      }),
    },
  })
  .handler((ctx) => ({
    id: ctx.input.id,
    name: "John",
    email: "john@example.com",
  }))
  
  // POST with body
  .post("/users", {
    input: {
      body: z.object({
        name: z.string().min(1),
        email: z.string().email(),
      }),
    },
    output: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }),
    errors: {
      400: z.object({
        error: z.object({
          code: z.literal("VALIDATION_ERROR"),
          message: z.string(),
        }),
      }),
    },
  })
  .handler((ctx) => ({
    id: "1",
    name: ctx.input.name,
    email: ctx.input.email,
  }))
  
  // PATCH with path params and body
  .patch("/users/{id}", {
    input: {
      params: z.object({
        id: z.string(),
      }),
      body: z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
      }),
    },
    output: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }),
  })
  .handler((ctx) => ({
    id: ctx.input.id,
    name: ctx.input.name || "John",
    email: ctx.input.email || "john@example.com",
  }))
  
  // DELETE
  .delete("/users/{id}", {
    input: {
      params: z.object({
        id: z.string(),
      }),
    },
    output: z.object({
      success: z.boolean(),
    }),
  })
  .handler(() => ({ success: true }));

const docsRouter = createDocsRouter({ api: router });
const app = createServer({ api: router, docs: docsRouter });
```

All routes are automatically documented with proper OpenAPI 3.0 schemas.

## Disabling Interactive Docs

If you only need the JSON spec (e.g., for external tools), disable the HTML docs:

```typescript
const docsRouter = createDocsRouter(
  { api: router },
  {
    enableDocs: false, // Only serve /openapi.json, not /docs
  }
);
```

## How It Works

The OpenAPI generation uses Zod 4's native `toJSONSchema()` function with the `openapi-3.0` target. This means:

- All Zod schemas are automatically converted to JSON Schema
- Complex types (objects, arrays, unions, etc.) are properly documented
- String formats (email, UUID, URL, etc.) are recognized
- Validation constraints are included in the schema

The generated OpenAPI spec is fully compliant with OpenAPI 3.0 specification and can be used with any OpenAPI-compatible tools.


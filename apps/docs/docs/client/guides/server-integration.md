# Server Integration

Learn how to integrate the client with your Altstack server.

## Overview

To use the client with your server, you need:

1. Generate an OpenAPI spec from your server router
2. Generate `Request` and `Response` types from the OpenAPI spec
3. Create a client instance with these types

## Step 1: Generate OpenAPI Spec

On your server, generate the OpenAPI spec:

```typescript
// server.ts
import { init, createServer, generateOpenAPISpec } from "@alt-stack/server";
import { z } from "zod";

const factory = init();
const router = factory.router()
  .get("/users/{id}", {
    input: {
      params: z.object({ id: z.string() }),
    },
    output: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email(),
    }),
  })
  .handler((ctx) => {
    return {
      id: ctx.input.id,
      name: "Alice",
      email: "alice@example.com",
    };
  });

const app = createServer({ api: router });

// Generate OpenAPI spec
const openApiSpec = generateOpenAPISpec(
  { api: router },
  {
    title: "My API",
    version: "1.0.0",
  }
);

export { openApiSpec };
export default app;
```

## Step 2: Generate Request and Response Types

Use the `@alt-stack/zod-openapi` package to generate TypeScript types:

```typescript
// generate-types.ts
import { openApiToZodTsCode } from "@alt-stack/zod-openapi";
import { openApiSpec } from "./server.js";
import { writeFileSync } from "fs";

const generatedCode = openApiToZodTsCode(openApiSpec, undefined, {
  includeRoutes: true,
});

writeFileSync("./src/generated-types.ts", generatedCode);
```

This generates a file with:
- Zod schemas for all request parameters, query strings, bodies, and responses
- `Request` object with lookup for request schemas
- `Response` object with lookup for response schemas organized by status code

Example generated output:

```typescript
// generated-types.ts
import { z } from "zod";

export const GetUsersIdParamsSchema = z.object({
  id: z.string(),
});

export const GetUsersId200ResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

export const GetUsersId404ErrorResponseSchema = z.object({
  error: z.object({
    code: z.literal("NOT_FOUND"),
    message: z.string(),
  }),
});

export const Request = {
  "/users/{id}": {
    GET: {
      params: GetUsersIdParamsSchema,
    },
  },
} as const;

export const Response = {
  "/users/{id}": {
    GET: {
      "200": GetUsersId200ResponseSchema,
      "404": GetUsersId404ErrorResponseSchema,
    },
  },
} as const;
```

## Step 3: Create Client

Now create the client using the generated types:

```typescript
// client.ts
import { createApiClient } from "@alt-stack/client";
import { Request, Response } from "./generated-types.js";

const client = createApiClient({
  baseUrl: "http://localhost:3000",
  Request,
  Response,
});

export { client };
```

## Step 4: Use the Client

Now you can make type-safe API calls:

```typescript
import { client } from "./client.js";

// Type-safe GET request
const result = await client.get("/users/{id}", {
  params: { id: "123" },
});

if (result.success) {
  // result.data is typed based on your output schema
  console.log(result.data.name); // ✅ Type-safe
}
```

## Keeping Types in Sync

It's recommended to regenerate types whenever you change your server routes. You can:

1. **Manual regeneration**: Run your type generation script when routes change
2. **Watch mode**: Use a file watcher to regenerate on route changes
3. **Build step**: Include type generation in your build process

## Sharing Types Between Projects

If your client is in a separate project from your server:

1. Export the OpenAPI spec from your server project
2. Share it via npm package, git submodule, or API endpoint
3. Generate types in your client project from the shared spec

Example: Export spec as JSON endpoint:

```typescript
// server.ts
const docsRouter = createDocsRouter({ api: router });
app.route("/docs", docsRouter);

// Access at /docs/openapi.json
```

Then fetch and generate types in client:

```typescript
// client project
const response = await fetch("http://localhost:3000/docs/openapi.json");
const openApiSpec = await response.json();
const generatedCode = openApiToZodTsCode(openApiSpec, undefined, {
  includeRoutes: true,
});
```


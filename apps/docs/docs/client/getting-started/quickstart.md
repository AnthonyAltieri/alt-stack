# Quickstart

Get started with a simple example that demonstrates how to use the type-safe API client.

## Basic Example

First, ensure your server generates an OpenAPI spec and Request/Response types:

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
const openApiSpec = generateOpenAPISpec({ api: router }, {
  title: "My API",
  version: "1.0.0",
});

export { openApiSpec };
export default app;
```

Then generate Request and Response types from the OpenAPI spec (see [Server Integration](../guides/server-integration) for details), and use the client:

```typescript
// client.ts
import { createApiClient } from "@alt-stack/client";
import { Request, Response } from "./generated-types.js";

const client = createApiClient({
  baseUrl: "http://localhost:3000",
  Request,
  Response,
});

// Make a type-safe API call
const result = await client.get("/users/{id}", {
  params: { id: "123" },
});

if (result.success) {
  // TypeScript knows the shape of result.data
  console.log(result.data.name); // ✅ Type-safe
  console.log(result.data.email); // ✅ Type-safe
} else {
  // Handle error
  console.error(result.error);
}
```

## Features

- **Type-safe**: Full TypeScript inference from server types
- **Validation**: Automatic runtime validation using Zod schemas
- **Error handling**: Typed error responses
- **Retry logic**: Built-in exponential backoff for failed requests
- **Path interpolation**: Automatic handling of path parameters


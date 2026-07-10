# HTTP client quickstart

Altstack's TypeScript HTTP clients take two Zod-backed maps:

- `Request` declares the allowed endpoints, methods, path parameters, query parameters, and JSON bodies.
- `Response` declares the JSON schema for each documented status code.

The Fetch and Ky adapters share the same `ApiClient` behavior. This quickstart uses Fetch because Node.js 18 and modern browsers already provide it.

## 1. Install

```bash
pnpm add @alt-stack/http-client-fetch zod
pnpm add -D tsx typescript @types/node
```

The client packages require Zod 4. Run this example on Node.js 18 or newer so the standard Fetch API is available.

## 2. Create a complete local example

Save this as `quickstart.ts`. It starts a temporary HTTP server, calls it through the typed client, and shuts the server down.

```typescript
import { createServer } from "node:http";
import { createApiClient } from "@alt-stack/http-client-fetch";
import { z } from "zod";

const Request = {
  "/users/{id}": {
    GET: {
      params: z.object({ id: z.string() }),
      query: z.object({ includeProfile: z.boolean().optional() }),
    },
  },
} as const;

const Response = {
  "/users/{id}": {
    GET: {
      "200": z.object({ id: z.string(), name: z.string() }),
      "404": z.object({
        error: z.object({ code: z.literal("NOT_FOUND"), message: z.string() }),
      }),
    },
  },
} as const;

const server = createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/users/u_1?includeProfile=true") {
    response.end(JSON.stringify({ id: "u_1", name: "Ada" }));
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({
    error: { code: "NOT_FOUND", message: "User not found" },
  }));
});

await new Promise<void>((resolve) => server.listen(3100, resolve));

try {
  const client = createApiClient({
    baseUrl: "http://127.0.0.1:3100",
    Request,
    Response,
  });

  const result = await client.get("/users/{id}", {
    params: { id: "u_1" },
    query: { includeProfile: true },
  });

  if (result.success) {
    console.log(result.code, result.body.name); // 200 Ada
  } else if (result.code === "404") {
    console.error(result.error.error.message);
  } else {
    console.error("Unexpected response", result.code, result.error);
  }
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
```

Run it:

```bash
pnpm tsx quickstart.ts
```

Expected output:

```text
200 Ada
```

## 3. Understand the contract

`client.get()` accepts only endpoints that declare `GET`. The endpoint literal makes `params`, `query`, and the response union specific to that route. The client:

1. validates path parameters and query data with the request schemas;
2. interpolates `{id}` and builds the query string;
3. executes the request;
4. validates a documented response body;
5. returns a union discriminated by `success` and then by `code`.

For `POST`, `PUT`, and `PATCH`, pass a `body`; the client validates it and sends JSON. `DELETE` has the same options shape as `GET`.

## 4. Use generated maps

In an application, generate `Request` and `Response` from OpenAPI rather than maintaining them twice:

```bash
pnpm add -D @alt-stack/zod-openapi
pnpm zod-openapi ./openapi.json --output ./src/generated-api.ts
```

Then import both values from the generated module. Treat that module as generated output and regenerate it when the OpenAPI document changes.

## Choose another runtime

- Use [`@alt-stack/http-client-ky`](./api/ky.md) when you need Ky instances, hooks, or Ky-wide options.
- Use [`http-client-rust-tokio`](./api/rust-tokio.md) from generated Rust SDKs.
- Implement [`HttpExecutor`](./api/core.md#httpexecutor) when neither transport fits.

Continue with [HTTP client common patterns](./common-patterns.md) or the [core API Documentation](./api/core.md).

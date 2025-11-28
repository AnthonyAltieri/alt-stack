# @alt-stack/client

A type-safe API client that integrates with zod-openapi generated Request/Response objects. Full TypeScript inference for requests, responses, and error handling.

## Documentation

📚 **Full documentation is available at:** [Client Docs](./../../apps/docs/)

The documentation website includes:

- Getting started guide
- Core concepts (validation, error handling, retries)
- Integration guides

## Quick Installation

```bash
pnpm add @alt-stack/client zod
# or
npm install @alt-stack/client zod
# or
yarn add @alt-stack/client zod
```

## Features

- **Type-safe requests**: Full TypeScript inference from Request/Response schemas
- **Discriminated responses**: Success and error responses are typed based on status codes
- **Automatic validation**: Request params, query, and body are validated against schemas
- **Retry logic**: Built-in exponential backoff with customizable `shouldRetry` callback
- **Timeout support**: Configurable request timeouts
- **Path interpolation**: Automatic path parameter substitution

## Quick Example

```typescript
import { createApiClient } from "@alt-stack/client";
import { Request, Response } from "./generated-types.js";

const client = createApiClient({
  baseUrl: "http://localhost:3000",
  Request,
  Response,
  headers: { Authorization: "Bearer token" },
});

// Type-safe GET request
const result = await client.get("/users/{id}", {
  params: { id: "123" },
  retries: 3,
  shouldRetry: ({ response }) => response?.status >= 500,
});

if (result.success) {
  console.log(result.body); // Typed response body
} else {
  console.error(result.error); // Typed error
}
```

## Request Options

| Option | Type | Description |
|--------|------|-------------|
| `params` | `object` | Path parameters |
| `query` | `object` | Query parameters |
| `body` | `object` | Request body (POST, PUT, PATCH) |
| `headers` | `object` | Additional headers |
| `timeout` | `number` | Timeout in milliseconds |
| `retries` | `number` | Number of retry attempts |
| `shouldRetry` | `function` | Custom retry logic |

## Custom Retry Logic

The `shouldRetry` callback receives context about the request attempt:

```typescript
await client.get("/users", {
  retries: 3,
  shouldRetry: ({ attempt, error, response }) => {
    // Retry on 5xx server errors
    if (response?.status >= 500) return true;
    // Retry on rate limiting
    if (response?.status === 429) return true;
    // Retry on network errors
    if (error) return true;
    return false;
  },
});
```

For complete documentation, see the [docs website](./../../apps/docs/).


# @alt-stack/client

Type-safe API client with full TypeScript inference from zod-openapi generated Request/Response schemas.

## Installation

```bash
pnpm add @alt-stack/client zod
```

## Features

- **Type inference** from Request/Response schemas
- **Discriminated responses** typed by status code
- **Automatic validation** of params, query, body, and responses
- **Retry logic** with exponential backoff
- **Timeout support**

## Usage

```typescript
import { createApiClient } from "@alt-stack/client";
import { Request, Response } from "./generated-types.js";

const client = createApiClient({
  baseUrl: "http://localhost:3000",
  Request,
  Response,
  headers: { Authorization: "Bearer token" },
});

const result = await client.get("/users/{id}", {
  params: { id: "123" },
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

```typescript
await client.get("/users", {
  retries: 3,
  shouldRetry: ({ attempt, error, response }) => {
    if (response?.status >= 500) return true; // Server errors
    if (response?.status === 429) return true; // Rate limiting
    if (error) return true; // Network errors
    return false;
  },
});
```

## Error Classes

| Class | Description |
|-------|-------------|
| `ValidationError` | Schema validation failed |
| `TimeoutError` | Request exceeded timeout |
| `UnexpectedApiClientError` | Network error or unexpected response |
| `ApiClientError` | Base class for all errors |


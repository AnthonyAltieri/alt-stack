# @alt-stack/http-client-fetch

Type-safe HTTP client using native fetch API.

## Installation

```bash
pnpm add @alt-stack/http-client-fetch zod
```

## Usage

```typescript
import { createApiClient } from "@alt-stack/http-client-fetch";
import { Request, Response } from "./generated-types.js";

const client = createApiClient({
  baseUrl: "https://api.example.com",
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

## Features

- **Type inference** from Request/Response schemas
- **Discriminated responses** typed by status code
- **Automatic validation** of params, query, body, and responses
- **Retry logic** with exponential backoff
- **Timeout support**
- **Raw Response access** for streaming, headers, etc.

## Fetch Options

Pass additional fetch options for credentials, cache mode, etc.:

```typescript
const client = createApiClient({
  baseUrl: "https://api.example.com",
  Request,
  Response,
  fetchOptions: {
    credentials: "include",
    cache: "no-store",
    mode: "cors",
  },
});
```

## Raw Response Access

Access the underlying `Response` object for advanced use cases:

```typescript
const result = await client.get("/users/{id}", { params: { id: "123" } });

if (result.success) {
  // Access raw Response
  console.log(result.raw.headers.get("x-request-id"));
  console.log(result.raw.status);
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

## Error Classes

| Class | Description |
|-------|-------------|
| `ValidationError` | Schema validation failed |
| `TimeoutError` | Request exceeded timeout |
| `UnexpectedApiClientError` | Network error or unexpected response |
| `ApiClientError` | Base class for all errors |


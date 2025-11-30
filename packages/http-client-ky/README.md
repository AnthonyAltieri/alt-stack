# @alt-stack/http-client-ky

Type-safe HTTP client using ky library.

## Installation

```bash
pnpm add @alt-stack/http-client-ky zod
```

## Usage

```typescript
import { createApiClient } from "@alt-stack/http-client-ky";
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
- **Raw KyResponse access** for streaming, headers, etc.
- **Ky hooks** for request/response interception

## Ky Options

Pass ky-specific options like hooks, retry config, etc.:

```typescript
const client = createApiClient({
  baseUrl: "https://api.example.com",
  Request,
  Response,
  kyOptions: {
    hooks: {
      beforeRequest: [
        (request) => {
          console.log("Request:", request.url);
        },
      ],
      afterResponse: [
        (request, options, response) => {
          console.log("Response:", response.status);
        },
      ],
    },
  },
});
```

## Custom Ky Instance

Use a pre-configured ky instance:

```typescript
import ky from "ky";

const customKy = ky.create({
  prefixUrl: "https://api.example.com",
  headers: { "X-Custom": "value" },
});

const client = createApiClient({
  baseUrl: "", // Can be empty if using prefixUrl
  Request,
  Response,
  ky: customKy,
});
```

## Raw Response Access

Access the underlying `KyResponse` object for advanced use cases:

```typescript
const result = await client.get("/users/{id}", { params: { id: "123" } });

if (result.success) {
  // Access raw KyResponse
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


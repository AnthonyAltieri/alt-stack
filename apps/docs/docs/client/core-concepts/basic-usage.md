# Basic Usage

Learn how to use the API client for making type-safe requests.

## Creating a Client

Use `createApiClient` to create a client instance:

```typescript
import { createApiClient } from "@alt-stack/client";
import { Request, Response } from "./generated-types.js";

const client = createApiClient({
  baseUrl: "http://localhost:3000",
  Request,
  Response,
  headers: {
    Authorization: "Bearer token",
  },
});
```

## Making Requests

The client provides methods for different HTTP methods:

### GET Requests

```typescript
const result = await client.get("/users/{id}", {
  params: { id: "123" },
  query: { include: "profile" },
});
```

### POST Requests

```typescript
const result = await client.post("/users", {
  body: {
    name: "Alice",
    email: "alice@example.com",
  },
});
```

### Supported Methods

The client currently supports:
- `get()` - GET requests
- `post()` - POST requests

## Handling Responses

All methods return a result object that can be either a success or error:

```typescript
const result = await client.get("/users/{id}", {
  params: { id: "123" },
});

if (result.success) {
  // Type-safe access to response body
  console.log(result.body);
  console.log(result.code); // Status code string, e.g., "200"
} else {
  // Handle error - check if it's a defined error or unexpected
  if (typeof result.code === "string") {
    // Server returned a defined error response
    console.error(result.code, result.error);
  } else {
    // Unexpected error (network, validation, etc.)
    console.error(result.error);
  }
}
```

## Request Options

You can pass additional options to requests:

```typescript
const result = await client.get("/users/{id}", {
  params: { id: "123" },
  headers: {
    "X-Custom-Header": "value",
  },
  timeout: 5000, // milliseconds
  retries: 3, // number of retry attempts
  shouldRetry: ({ response }) => response?.status >= 500, // custom retry logic
});
```

| Option | Type | Description |
|--------|------|-------------|
| `params` | `object` | Path parameters to interpolate into the URL |
| `query` | `object` | Query parameters to append to the URL |
| `body` | `object` | Request body (for POST, PUT, PATCH) |
| `headers` | `object` | Additional headers to include |
| `timeout` | `number` | Request timeout in milliseconds |
| `retries` | `number` | Number of retry attempts |
| `shouldRetry` | `function` | Custom retry logic callback |

See [Error Handling](./error-handling.md#custom-retry-logic) for more details on `shouldRetry`.


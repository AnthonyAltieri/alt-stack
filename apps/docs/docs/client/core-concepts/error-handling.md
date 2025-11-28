# Error Handling

The client provides comprehensive error handling with typed error responses.

## Response Types

Every request returns a result that can be one of three types:

1. **Success Response** - Request succeeded
2. **Error Response** - Server returned an error response
3. **Unexpected Error Response** - Network, validation, or unexpected error

## Success Response

```typescript
const result = await client.get("/users/{id}", {
  params: { id: "123" },
});

if (result.success) {
  // result.body is typed based on your output schema
  console.log(result.body);
  // result.code contains the status code (e.g., "200", "201")
}
```

## Error Response

When the server returns an error response (non-2xx status):

```typescript
const result = await client.post("/users", {
  body: { name: "Alice" },
});

if (!result.success && typeof result.code === "string") {
  // Server error response (typed error from Response schemas)
  // result.error is typed based on the error schema for this status code
  console.error(result.code); // HTTP status code (e.g., "404", "500")
  console.error(result.error); // Typed error body based on schema
}
```

## Unexpected Error Response

For network errors, validation errors, or other unexpected issues:

```typescript
const result = await client.get("/users/{id}", {
  params: { id: "123" },
});

if (!result.success && typeof result.code === "number") {
  // Unexpected error response (not defined in Response schemas)
  if (result.error instanceof Error) {
    console.error(result.error.message); // Error message
    // error may be UnexpectedApiClientError with additional properties
  } else {
    console.error("Unexpected error:", result.error);
  }
  console.error(result.code); // HTTP status code as number
}
```

## Error Classes

The client also throws error classes for programmatic handling:

```typescript
import {
  ValidationError,
  UnexpectedApiClientError,
  ApiClientError,
} from "@alt-stack/client";

try {
  await client.get("/users/{id}", {
    params: { id: 123 }, // Invalid type
  });
} catch (error) {
  if (error instanceof ValidationError) {
    // Validation failed
    console.error("Validation error:", error.details);
  } else if (error instanceof UnexpectedApiClientError) {
    // Network or unexpected error
    console.error("Request failed:", error.message);
  } else if (error instanceof ApiClientError) {
    // Base class for all client errors
    console.error("Client error:", error.message);
  }
}
```

## Retry Logic

The client includes built-in retry logic with exponential backoff:

```typescript
const result = await client.get("/users/{id}", {
  params: { id: "123" },
  retries: 3, // Will retry up to 3 times
});
```

By default, retries are automatically performed for:
- Network errors

Retries are **not** performed by default for:
- Validation errors
- Client errors (4xx status codes)
- Server errors (5xx status codes) - these are valid HTTP responses

### Custom Retry Logic

Use the `shouldRetry` option to customize retry behavior:

```typescript
const result = await client.get("/users/{id}", {
  params: { id: "123" },
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

The `shouldRetry` callback receives a context object with:
- `attempt` - Current attempt number (0-indexed)
- `error` - Error thrown during request (network errors, timeouts)
- `response` - HTTP response received (status, statusText, data)

#### Examples

**Retry on 5xx server errors:**

```typescript
shouldRetry: ({ response }) => response?.status !== undefined && response.status >= 500
```

**Limit retries regardless of `retries` option:**

```typescript
shouldRetry: ({ attempt }) => attempt < 2
```

**Retry on specific error codes:**

```typescript
shouldRetry: ({ response }) => {
  const retryableCodes = [500, 502, 503, 504, 429];
  return response?.status !== undefined && retryableCodes.includes(response.status);
}
```

**Custom logic combining error and response:**

```typescript
shouldRetry: ({ error, response }) => {
  // Always retry network errors
  if (error) return true;
  // Retry rate limits and server errors
  if (response?.status === 429 || (response?.status ?? 0) >= 500) return true;
  return false;
}
```

## Timeouts

Set a timeout for requests:

```typescript
const result = await client.get("/users/{id}", {
  params: { id: "123" },
  timeout: 5000, // 5 seconds
});
```

If the request takes longer than the timeout, it will throw an error.


# Client-Side Usage

When making requests from the client, include credentials to support authentication cookies.

## Using Hono Client

Use the Hono client (`hc`) for type-safe API calls:

```typescript
import { hc } from "hono/client";

const client = hc("http://localhost:3000", {
  init: {
    credentials: "include", // Required for auth cookies
  },
});

// Make authenticated requests
const response = await client.api.users.profile.$get();
```

## Fetch with Credentials

When using standard `fetch`, ensure credentials are included:

```typescript
const response = await fetch("http://localhost:3000/api/users/profile", {
  method: "GET",
  credentials: "include", // Required for auth cookies
  headers: {
    "Content-Type": "application/json",
  },
});

const data = await response.json();
```

## Type-Safe API Calls

The Hono client provides type inference from your router definitions. The client automatically knows:

- Available routes
- Request methods
- Input types (params, query, body)
- Output types
- Error types

```typescript
// TypeScript knows this route exists and what it expects
const response = await client.api.users["{id}"].$get({
  param: {
    id: "123",
  },
  query: {
    include: "profile",
  },
});

// response.data is typed based on your output schema
console.log(response.data.name); // ✅ TypeScript knows this exists
```

## Error Handling

Handle errors type-safely:

```typescript
try {
  const response = await client.api.users["{id}"].$get({
    param: { id: "123" },
  });
  
  if (!response.ok) {
    // Handle error response
    const error = await response.json();
    console.error(error);
  }
} catch (error) {
  // Handle network errors
  console.error("Request failed:", error);
}
```


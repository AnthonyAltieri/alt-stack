# @alt-stack/http-client-core

Core types, errors, and logic for type-safe HTTP clients.

## Installation

```bash
pnpm add @alt-stack/http-client-core zod
```

## Overview

This package provides the foundation for building type-safe HTTP clients. It is not meant to be used directly - instead, use one of the binding packages:

- `@alt-stack/http-client-fetch` - Uses native fetch API
- `@alt-stack/http-client-ky` - Uses ky library

## What's Included

- **Types**: Request/response type extraction utilities
- **Errors**: `ApiClientError`, `ValidationError`, `TimeoutError`, `UnexpectedApiClientError`
- **ApiClient**: Base client class that accepts an `HttpExecutor`
- **HttpExecutor**: Interface for HTTP implementations

## Creating Custom Bindings

Implement the `HttpExecutor` interface:

```typescript
import { HttpExecutor, ExecuteRequest, ExecuteResponse } from "@alt-stack/http-client-core";

class MyExecutor implements HttpExecutor<MyRawResponse> {
  async execute(request: ExecuteRequest): Promise<ExecuteResponse<MyRawResponse>> {
    // Your implementation
    return {
      status: 200,
      statusText: "OK",
      data: parsedData,
      raw: rawResponse,
    };
  }
}
```

Then create a client:

```typescript
import { ApiClient } from "@alt-stack/http-client-core";

const client = new ApiClient({
  baseUrl: "https://api.example.com",
  Request,
  Response,
  executor: new MyExecutor(),
});
```


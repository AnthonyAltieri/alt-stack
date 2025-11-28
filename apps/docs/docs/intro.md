---
slug: /
---

# Introduction

Altstack is a type-safe full-stack framework with separate server and client packages, built with Zod validation. Inspired by tRPC's builder pattern, providing full type inference from a central router definition.

## Architecture

Altstack's server framework is split into a core package and framework-specific adapters:

### Server Packages

- **`@alt-stack/server-core`**: Framework-agnostic core containing types, router, middleware, and validation logic. Used as a dependency by the adapter packages.

- **`@alt-stack/server-hono`**: [Hono](https://hono.dev/) adapter - creates a Hono app with full type inference. **Recommended for new projects.**

- **`@alt-stack/server-express`**: [Express](https://expressjs.com/) adapter - creates an Express app with the same type-safe API.

### Client Package

- **`@alt-stack/client`**: A type-safe API client that works seamlessly with server-generated types

## Choosing an Adapter

| Feature | Hono | Express |
|---------|------|---------|
| Performance | Faster (Web Standards) | Mature ecosystem |
| Edge/Serverless | Native support | Requires adapters |
| Context access | `ctx.hono` | `ctx.express.req/res` |
| Best for | New projects, edge | Existing Express apps |

## Server Features

- **Type-safe routes**: Full TypeScript inference from Zod schemas
- **Builder pattern**: Fluent API for defining routes with `.get()`, `.post()`, etc.
- **Type-safe errors**: `ctx.error()` with automatic status code inference from error schemas
- **Reusable procedures**: Create reusable procedures with middleware (tRPC-style pattern)
- **Middleware support**: Router-level and procedure-level middleware with context extension
- **Router combination**: Merge multiple routers with `.merge()`
- **Validation**: Automatic Zod validation for inputs and optional outputs
- **OpenAPI generation**: Generate OpenAPI specs and interactive Swagger UI
- **Native framework access**: Full access to underlying framework APIs

## Client Features

- **Type-safe API calls**: Full TypeScript inference from server-generated types
- **Automatic validation**: Runtime validation using Zod schemas
- **Retry logic**: Built-in exponential backoff for failed requests
- **Path interpolation**: Automatic handling of path parameters
- **Error handling**: Typed error responses with detailed error information

## Quick Example

```typescript
import { init, createServer, router } from "@alt-stack/server-hono";
import { z } from "zod";

const factory = init();

const appRouter = router({
  "/hello": factory.procedure
    .output(z.object({ message: z.string() }))
    .get(() => ({ message: "Hello, World!" })),
});

const app = createServer({ api: appRouter });
export default app;
```

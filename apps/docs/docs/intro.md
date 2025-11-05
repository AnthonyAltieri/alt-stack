---
slug: /
---

# Introduction

Altstack is a type-safe full-stack framework with separate server and client packages, built on Hono with Zod validation. Inspired by tRPC's builder pattern, providing full type inference from a central router definition.

## Architecture

Altstack consists of two main packages:

- **`@alt-stack/server`**: A lightweight, type-safe server framework for building APIs
- **`@alt-stack/client`**: A type-safe API client that works seamlessly with server-generated types

## Server Features

- **Type-safe routes**: Full TypeScript inference from Zod schemas
- **Builder pattern**: Fluent API for defining routes with `.get()`, `.post()`, etc.
- **Type-safe errors**: `ctx.error()` with automatic status code inference from error schemas
- **Reusable procedures**: Create reusable procedures with middleware (tRPC-style pattern)
- **Middleware support**: Router-level and procedure-level middleware with context extension
- **Router combination**: Merge multiple routers with `.merge()`
- **Validation**: Automatic Zod validation for inputs and optional outputs
- **OpenAPI generation**: Generate OpenAPI specs and type-safe Request/Response objects
- **Lightweight**: Minimal abstraction over Hono - easy to audit and understand

## Client Features

- **Type-safe API calls**: Full TypeScript inference from server-generated types
- **Automatic validation**: Runtime validation using Zod schemas
- **Retry logic**: Built-in exponential backoff for failed requests
- **Path interpolation**: Automatic handling of path parameters
- **Error handling**: Typed error responses with detailed error information


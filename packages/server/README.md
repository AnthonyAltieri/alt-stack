# @alt-stack/server

A lightweight, type-safe server framework built on Hono with Zod validation. Inspired by tRPC's builder pattern, providing full type inference from a central router definition.

## Documentation

📚 **Full documentation is available at:** [Server Framework Docs](./../../apps/docs/)

The documentation website is the source of truth for all documentation. The docs include:

- Getting started guide
- Core concepts (validation, error handling, middleware, etc.)
- Integration guides (Better Auth, CORS, etc.)
- API examples and best practices

## Quick Installation

```bash
pnpm add @alt-stack/server hono zod
# or
npm install @alt-stack/server hono zod
# or
yarn add @alt-stack/server hono zod
```

## Features

- **Type-safe routes**: Full TypeScript inference from Zod schemas
- **Builder pattern**: Fluent API for defining routes with `.get()`, `.post()`, etc.
- **Type-safe errors**: `ctx.throw()` with automatic status code inference from error schemas
- **Middleware support**: Router-level and procedure-level middleware with context extension
- **Router combination**: Merge multiple routers with `.merge()`
- **Validation**: Automatic Zod validation for inputs and optional outputs
- **Lightweight**: Minimal abstraction over Hono - easy to audit and understand

For complete documentation, see the [docs website](./../../apps/docs/).

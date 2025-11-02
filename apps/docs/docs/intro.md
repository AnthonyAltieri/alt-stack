# Introduction

A lightweight, type-safe server framework built on Hono with Zod validation. Inspired by tRPC's builder pattern, providing full type inference from a central router definition.

## Features

- **Type-safe routes**: Full TypeScript inference from Zod schemas
- **Builder pattern**: Fluent API for defining routes with `.get()`, `.post()`, etc.
- **Type-safe errors**: `ctx.error()` with automatic status code inference from error schemas
- **Reusable procedures**: Create reusable procedures with middleware (tRPC-style pattern)
- **Middleware support**: Router-level and procedure-level middleware with context extension
- **Router combination**: Merge multiple routers with `.merge()`
- **Validation**: Automatic Zod validation for inputs and optional outputs
- **Lightweight**: Minimal abstraction over Hono - easy to audit and understand


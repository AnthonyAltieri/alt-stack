# @alt-stack/server-core

Framework-agnostic core package for the Altstack server framework. This package contains the shared types, router, middleware, validation, and OpenAPI generation logic used by the framework adapters.

> **Note**: This package is not meant to be used directly. Instead, use one of the adapter packages:
> - [`@alt-stack/server-hono`](../server-hono/README.md) - For Hono-based servers
> - [`@alt-stack/server-express`](../server-express/README.md) - For Express-based servers

## What's Included

- **Router**: Type-safe router with procedure registration
- **Procedure Builder**: Fluent API for building procedures with input/output validation
- **Middleware**: Composable middleware with context extension
- **Validation**: Zod-based input validation for params, query, and body
- **Errors**: Standard error classes (ServerError, ValidationError, etc.)
- **OpenAPI**: Generate OpenAPI 3.0 specs from router definitions

## Installation

```bash
pnpm add @alt-stack/server-core zod
```

## For Adapter Authors

If you're building a custom adapter for a different framework, you can depend on this package:

```typescript
import {
  Router,
  BaseProcedureBuilder,
  validateInput,
  generateOpenAPISpec,
  ServerError,
  ValidationError,
} from "@alt-stack/server-core";

// Define your framework-specific context
interface MyFrameworkContext extends BaseContext {
  myFramework: { req: MyRequest; res: MyResponse };
}

// Implement createServer() using the Router's getProcedures()
export function createServer<TCustomContext extends object>(
  config: Record<string, Router<TCustomContext>>,
) {
  // ... framework-specific implementation
}
```

## Exports

### Types
- `BaseContext` - Empty base context interface for adapters to extend
- `TypedContext` - Context with input and error function
- `InputConfig` - Configuration for params/query/body schemas
- `Procedure`, `ReadyProcedure`, `PendingProcedure` - Procedure types

### Classes
- `Router` - Router class for registering procedures
- `BaseProcedureBuilder` - Builder for creating procedures

### Functions
- `init()` - Initialize factory with custom context
- `router()` - Create a router with tRPC-style config
- `createRouter()` - Create an empty router
- `mergeRouters()` - Merge multiple routers
- `createMiddleware()` - Create typed middleware
- `validateInput()` - Validate input against schemas
- `generateOpenAPISpec()` - Generate OpenAPI spec from routers

### Error Classes
- `ServerError` - Base error with status code
- `ValidationError` - 400 validation error
- `NotFoundError` - 404 not found
- `UnauthorizedError` - 401 unauthorized
- `ForbiddenError` - 403 forbidden
- `BadRequestError` - 400 bad request
- `InternalServerError` - 500 internal error

## License

MIT


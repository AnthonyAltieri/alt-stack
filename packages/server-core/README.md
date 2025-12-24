# @alt-stack/server-core

Framework-agnostic core package for the Altstack server framework. This package contains the shared types, router, middleware, validation, and OpenAPI generation logic used by the framework adapters.

> **Note**: This package is not meant to be used directly. Instead, use one of the adapter packages:
> - [`@alt-stack/server-hono`](../server-hono/README.md) - For Hono-based servers
> - [`@alt-stack/server-express`](../server-express/README.md) - For Express-based servers
> - [`@alt-stack/server-bun`](../server-bun/README.md) - For Bun-based servers

## What's Included

- **Router**: Type-safe router with procedure registration
- **Procedure Builder**: Fluent API for building procedures with input/output validation
- **Middleware**: Composable middleware with context extension
- **Validation**: Zod-based input validation for params, query, and body
- **OpenAPI**: Generate OpenAPI 3.0 specs from router definitions
- **TaggedError**: Re-exported from `@alt-stack/result` for defining error classes

## Installation

```bash
pnpm add @alt-stack/server-core zod
```

## Error Handling

Consumers must define their own error classes using `TaggedError`:

```typescript
import { TaggedError } from "@alt-stack/server-core";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly resourceId: string) {
    super(`Resource ${resourceId} not found`);
  }
}

class UnauthorizedError extends TaggedError {
  readonly _tag = "UnauthorizedError";
  constructor(public readonly message: string = "Authentication required") {
    super(message);
  }
}
```

Error schemas must include `_tag: z.literal("...")`:

```typescript
.errors({
  404: z.object({
    _tag: z.literal("NotFoundError"),
    resourceId: z.string(),
  }),
  401: z.object({
    _tag: z.literal("UnauthorizedError"),
    message: z.string(),
  }),
})
```

## For Adapter Authors

If you're building a custom adapter for a different framework, you can depend on this package:

```typescript
import {
  Router,
  BaseProcedureBuilder,
  validateInput,
  generateOpenAPISpec,
  TaggedError,
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
- `ValidateErrorConfig` - Type for validating error schemas have `_tag` literals

### Classes
- `Router` - Router class for registering procedures
- `BaseProcedureBuilder` - Builder for creating procedures
- `TaggedError` - Base class for typed errors (re-exported from `@alt-stack/result`)

### Functions
- `init()` - Initialize factory with custom context. Returns:
  - `router` - Create a router with tRPC-style config
  - `mergeRouters` - Merge multiple routers
  - `procedure` - Base procedure builder with configured context
  - `defaultErrorHandlers` - Default 400/500 error handlers and schemas
- `router()` - Create a router with tRPC-style config
- `createRouter()` - Create an empty router
- `mergeRouters()` - Merge multiple routers
- `createMiddleware()` - Create typed middleware
- `validateInput()` - Validate input against schemas
- `generateOpenAPISpec()` - Generate OpenAPI spec from routers

## License

MIT

# @alt-stack/server (DEPRECATED)

> ⚠️ **This package is deprecated.** Please migrate to one of the adapter packages:
> - [`@alt-stack/server-hono`](../server-hono/README.md) - For Hono-based servers (recommended)
> - [`@alt-stack/server-express`](../server-express/README.md) - For Express-based servers

## Migration Guide

### Step 1: Update your dependencies

```bash
# Remove old package
pnpm remove @alt-stack/server

# Install new package (choose one)
pnpm add @alt-stack/server-hono hono zod
# or
pnpm add @alt-stack/server-express express zod
```

### Step 2: Update imports

```typescript
// Before
import { createServer, router, init } from "@alt-stack/server";
import type { BaseContext } from "@alt-stack/server";

// After (Hono)
import { createServer, router, init } from "@alt-stack/server-hono";
import type { HonoBaseContext } from "@alt-stack/server-hono";

// After (Express)
import { createServer, router, init } from "@alt-stack/server-express";
import type { ExpressBaseContext } from "@alt-stack/server-express";
```

### Step 3: Handler code

Handler code remains the same! The `ctx.hono` property is still available in the Hono adapter.

## Why the change?

The server framework has been refactored into:

1. **`@alt-stack/server-core`**: Framework-agnostic types, router, middleware, and validation
2. **`@alt-stack/server-hono`**: Hono-specific adapter
3. **`@alt-stack/server-express`**: Express-specific adapter

This allows you to:
- Choose your preferred HTTP framework
- Share router definitions between different server implementations
- Get native framework APIs without abstraction overhead

## Documentation

📚 **Full documentation is available at:** [Server Framework Docs](./../../apps/docs/)

## License

MIT

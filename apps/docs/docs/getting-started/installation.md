# Installation

Choose an adapter based on your preferred HTTP framework.

## Hono Adapter (Recommended)

Best for new projects, edge deployments, and serverless environments.

```bash
pnpm add @alt-stack/server-hono hono zod
# or
npm install @alt-stack/server-hono hono zod
# or
yarn add @alt-stack/server-hono hono zod
```

### Peer Dependencies

- **hono**: `^4.0.0` - The underlying HTTP framework
- **zod**: `^4.0.0` - For schema validation and type inference

## Express Adapter

Best for existing Express applications or teams familiar with Express.

```bash
pnpm add @alt-stack/server-express express zod
# or
npm install @alt-stack/server-express express zod
# or
yarn add @alt-stack/server-express express zod
```

For TypeScript users:
```bash
pnpm add -D @types/express
```

### Peer Dependencies

- **express**: `^4.0.0 || ^5.0.0` - The underlying HTTP framework
- **zod**: `^4.0.0` - For schema validation and type inference

## Which Adapter Should I Choose?

| Feature | Hono | Express |
|---------|------|---------|
| Performance | Faster (Web Standards API) | Mature, well-tested |
| Bundle size | Smaller | Larger ecosystem |
| Edge/Serverless | Native support (Cloudflare, Vercel) | Requires adapters |
| Middleware ecosystem | Growing | Extensive |
| Learning curve | Familiar if you know fetch | Familiar if you know Express |

**Recommendation**: Use `@alt-stack/server-hono` for new projects. Use `@alt-stack/server-express` if you're adding to an existing Express app or need specific Express middleware.

## Migration from @alt-stack/server

If you're using the deprecated `@alt-stack/server` package:

```bash
# Remove old package
pnpm remove @alt-stack/server

# Install new package
pnpm add @alt-stack/server-hono hono zod
```

Then update your imports:

```typescript
// Before
import { createServer, router } from "@alt-stack/server";

// After
import { createServer, router } from "@alt-stack/server-hono";
```

The API remains the same - only the import path changes.

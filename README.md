# Altstack

A monorepo containing type-safe utilities for building modern TypeScript applications, with a focus on Zod validation and server frameworks.

## What's inside?

This monorepo includes the following packages and apps:

### Server Packages

The server framework is split into a core package and framework-specific adapters:

- **`@alt-stack/server-core`**: Framework-agnostic core containing types, router, middleware, validation, and OpenAPI generation. Used as a dependency by the adapter packages.

- **`@alt-stack/server-hono`**: Hono adapter for the server framework. Provides `createServer()` that creates a Hono app with full type inference from Zod schemas. **Recommended for new projects.**

- **`@alt-stack/server-express`**: Express adapter for the server framework. Provides `createServer()` that creates an Express app with the same type-safe API.

- **`@alt-stack/server`** *(deprecated)*: Original package, now deprecated. Please migrate to `@alt-stack/server-hono` or `@alt-stack/server-express`.

### Client Packages

- **`@alt-stack/http-client-fetch`**: Type-safe API client using native fetch. Provides full type inference, request/response validation, retry logic, and error handling.

- **`@alt-stack/http-client-ky`**: Type-safe API client using ky library. Same features as fetch client plus ky-specific options like hooks.

### Other Packages

- **`zod-openapi`**: Convert OpenAPI schemas to Zod schemas with TypeScript code generation. Supports complex types, custom formats, and generates request/response lookup objects.

- **`@alt-stack/typescript-config`**: Shared TypeScript configuration files used throughout the monorepo.

### Apps

- **`docs`**: Documentation website built with [Docusaurus](https://docusaurus.io/) for the server framework.

- **`example-altstack-server`**: A complete example todo application demonstrating the `@alt-stack/server-hono` framework with full CRUD operations and type-safe error handling.

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

## Prerequisites

- Node.js >= 18
- pnpm 9.0.0 (or compatible version)

## Installation

```bash
pnpm install
```

## Quick Start

### Using Hono (recommended)

```bash
pnpm add @alt-stack/server-hono hono zod
```

```typescript
import { init, createServer, router } from "@alt-stack/server-hono";
import { z } from "zod";

const factory = init();

const appRouter = router({
  "/users/{id}": factory.procedure
    .input({ params: z.object({ id: z.string() }) })
    .output(z.object({ id: z.string(), name: z.string() }))
    .get(({ input }) => ({ id: input.params.id, name: "Alice" })),
});

const app = createServer({ api: appRouter });
export default app;
```

### Using Express

```bash
pnpm add @alt-stack/server-express express zod
```

```typescript
import { init, createServer, router } from "@alt-stack/server-express";
import { z } from "zod";

const factory = init();

const appRouter = router({
  "/users/{id}": factory.procedure
    .input({ params: z.object({ id: z.string() }) })
    .output(z.object({ id: z.string(), name: z.string() }))
    .get(({ input }) => ({ id: input.params.id, name: "Alice" })),
});

const app = createServer({ api: appRouter });
app.listen(3000);
```

## Development

To develop all apps and packages:

```bash
pnpm dev
```

To develop a specific app or package:

```bash
pnpm --filter=example-altstack-server dev
pnpm --filter=docs start
```

## Build

To build all apps and packages:

```bash
pnpm build
```

To build a specific package:

```bash
pnpm --filter=@alt-stack/server-hono build
pnpm --filter=docs build
```

## Scripts

- `pnpm dev` - Run all apps in development mode
- `pnpm build` - Build all apps and packages
- `pnpm lint` - Lint all code
- `pnpm lint:fix` - Fix linting issues
- `pnpm check-types` - Type check all packages

## Learn More

- **Server Framework**: See the [documentation website](./apps/docs/) for complete guides
- **Hono Adapter**: See [`packages/server-hono/README.md`](./packages/server-hono/README.md)
- **Express Adapter**: See [`packages/server-express/README.md`](./packages/server-express/README.md)
- **Core Package**: See [`packages/server-core/README.md`](./packages/server-core/README.md)
- **Zod OpenAPI**: See [`packages/zod-openapi/README.md`](./packages/zod-openapi/README.md)
- **Example Server**: See [`apps/example-altstack-server/README.md`](./apps/example-altstack-server/README.md)

## Useful Links

Learn more about Turborepo:

- [Tasks](https://turborepo.com/docs/crafting-your-repository/running-tasks)
- [Caching](https://turborepo.com/docs/crafting-your-repository/caching)
- [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching)
- [Filtering](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters)
- [Configuration Options](https://turborepo.com/docs/reference/configuration)
- [CLI Usage](https://turborepo.com/docs/reference/command-line-reference)

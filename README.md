# Altstack

A monorepo containing type-safe utilities for building modern TypeScript applications, with a focus on Zod validation and server frameworks.

## What's inside?

This monorepo includes the following packages and apps:

### Packages

- **`@repo/server`**: A lightweight, type-safe server framework built on Hono with Zod validation. Inspired by tRPC's builder pattern, providing full type inference from a central router definition.

- **`zod-openapi`**: Convert OpenAPI schemas to Zod schemas with TypeScript code generation. Supports complex types, custom formats, and generates request/response lookup objects.

- **`@repo/typescript-config`**: Shared TypeScript configuration files used throughout the monorepo.

### Apps

- **`docs`**: Documentation website built with [Docusaurus](https://docusaurus.io/) for the `@repo/server` framework.

- **`example-altstack-server`**: A complete example todo application demonstrating the `@repo/server` framework with full CRUD operations and type-safe error handling.

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

## Prerequisites

- Node.js >= 18
- pnpm 9.0.0 (or compatible version)

## Installation

```bash
pnpm install
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
pnpm --filter=@repo/server build
pnpm --filter=docs build
```

## Scripts

- `pnpm dev` - Run all apps in development mode
- `pnpm build` - Build all apps and packages
- `pnpm lint` - Lint all code
- `pnpm lint:fix` - Fix linting issues
- `pnpm check-types` - Type check all packages

## Learn More

- **Server Framework**: See [`packages/server/README.md`](./packages/server/README.md) and the [documentation website](./apps/docs/)
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

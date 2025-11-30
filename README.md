# Altstack

A type-safe full-stack framework built with Zod validation. Inspired by tRPC's builder pattern, providing full type inference from a central router definition.

## Packages

### Server
- `@alt-stack/server-core` - Framework-agnostic core
- `@alt-stack/server-hono` - Hono adapter *(recommended)*
- `@alt-stack/server-express` - Express adapter

### Client
- `@alt-stack/http-client-fetch` - Type-safe client using native fetch
- `@alt-stack/http-client-ky` - Type-safe client using ky

### Kafka
- `@alt-stack/kafka-core` - Kafka utilities with Zod validation
- `@alt-stack/kafka-client-kafkajs` - KafkaJS adapter
- `@alt-stack/kafka-client-warpstream` - WarpStream adapter

### Workers
- `@alt-stack/workers-core` - Background job processing core
- `@alt-stack/workers-warpstream` - WarpStream-backed workers
- `@alt-stack/workers-trigger` - Trigger.dev adapter
- `@alt-stack/workers-client-core` - Type-safe worker client

### Utilities
- `zod-openapi` - OpenAPI to Zod schema generation
- `zod-asyncapi` - AsyncAPI to Zod schema generation

## Quick Start

```bash
pnpm add @alt-stack/server-hono hono zod
```

```typescript
import { init, createServer, router } from "@alt-stack/server-hono";
import { z } from "zod";

const factory = init();

const appRouter = router({
  "/hello": factory.procedure
    .output(z.object({ message: z.string() }))
    .get(() => ({ message: "Hello, World!" })),
});

export default createServer({ api: appRouter });
```

## Documentation

For complete guides, API reference, and examples, visit the documentation:

**https://altstack-docs.vercel.app/**

## Development

```bash
pnpm install
pnpm dev      # Run all apps in dev mode
pnpm build    # Build all packages
```

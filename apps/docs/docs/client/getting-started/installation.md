# Installation

Choose the HTTP client binding that fits your needs:

## Using Native Fetch

```bash
pnpm add @alt-stack/http-client-fetch zod
```

## Using Ky

```bash
pnpm add @alt-stack/http-client-ky zod
```

## Peer Dependencies

- **zod**: `^4.0.0`

## Requirements

1. A server built with `@alt-stack/server-hono` that exposes an OpenAPI spec
2. Generated `Request` and `Response` types from the OpenAPI spec (see [Server Integration](../guides/server-integration))

## Package Comparison

| Package | Description | Best For |
|---------|-------------|----------|
| `@alt-stack/http-client-fetch` | Native fetch API | Simple use cases, browser/Node.js |
| `@alt-stack/http-client-ky` | Ky library | Advanced features like hooks, pre-configured instances |

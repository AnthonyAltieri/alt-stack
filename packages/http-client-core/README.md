# `@alt-stack/http-client-core`

Transport-neutral request validation, response typing, retries, logging, and errors for Altstack TypeScript HTTP clients.

Most applications should install [`@alt-stack/http-client-fetch`](../http-client-fetch/README.md) or [`@alt-stack/http-client-ky`](../http-client-ky/README.md), which provide an executor and re-export this package.

## Install

```bash
pnpm add @alt-stack/http-client-core zod
```

Zod 4 is required as a peer.

## Minimal custom executor

```typescript
import { ApiClient, type HttpExecutor } from "@alt-stack/http-client-core";
import { z } from "zod";

const Request = { "/health": { GET: {} } } as const;
const Response = {
  "/health": { GET: { "200": z.object({ ok: z.boolean() }) } },
} as const;

const executor: HttpExecutor<{ requestId: string }> = {
  async execute(request) {
    return {
      status: 200,
      statusText: "OK",
      data: { ok: true },
      raw: { requestId: request.url },
    };
  },
};

const client = new ApiClient({
  baseUrl: "https://api.example.test",
  Request,
  Response,
  executor,
});

const result = await client.get("/health", {});
```

The executor owns I/O, timeout enforcement, and decoding. The core validates request/response schemas and returns documented HTTP statuses as a discriminated union.

## Documentation

- [Quickstart](../../apps/docs/docs/http-client/quickstart.md)
- [Common Patterns](../../apps/docs/docs/http-client/common-patterns.md)
- [API Documentation](../../apps/docs/docs/http-client/api/core.md)

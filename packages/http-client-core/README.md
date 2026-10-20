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

## Per-request headers

The client-level `headers` option accepts a `Record<string, unknown>` or a function returning that record, synchronously or as a `Promise`:

```typescript
const client = new ApiClient({
  baseUrl: "https://api.example.test",
  Request,
  Response,
  executor,
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
});

await client.get("/health", { headers: { "X-Request-Id": "request-123" } });
```

Supply your application's `getToken` function. The provider runs once per attempt, including core retries, after request validation. Headers merge in this order: the default `Content-Type: application/json` when a JSON body is sent, client headers, then request headers. Requests without a body have no default `Content-Type`. Values are stringified; `null` and `undefined` are omitted without removing earlier values. Keys retain their existing case-sensitive merge behavior.

A thrown or rejected provider error becomes an `UnexpectedApiClientError` with message `Header provider failed`. Its original message and cause are discarded to keep credentials out of errors and logs. Existing retry rules apply. Providers are not covered by the executor's request timeout.

## Documentation

- [Quickstart](../../apps/docs/docs/http-client/quickstart.md)
- [Common Patterns](../../apps/docs/docs/http-client/common-patterns.md)
- [API Documentation](../../apps/docs/docs/http-client/api/core.md)

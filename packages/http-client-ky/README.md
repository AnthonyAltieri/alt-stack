# `@alt-stack/http-client-ky`

Typed Zod-backed HTTP client using Ky. It supports a preconfigured `KyInstance` or adapter-wide Ky options and exposes `KyResponse` as `raw`.

## Install

```bash
pnpm add @alt-stack/http-client-ky zod
```

Zod 4 is required as a peer. Ky is a direct dependency.

## Quick use

```typescript
import ky from "ky";
import { createApiClient } from "@alt-stack/http-client-ky";
import { Request, Response } from "./generated-api.js";

const transport = ky.create({
  hooks: {
    beforeRequest: [(request) => request.headers.set("X-App", "dashboard")],
  },
});

const api = createApiClient({
  baseUrl: "https://api.example.test",
  Request,
  Response,
  ky: transport,
});
```

The executor forces `throwHttpErrors: false` so documented non-2xx responses become typed result values. Avoid combining Ky retries with core `retries` unless two retry layers are intentional.

## Documentation

- [Quickstart](../../apps/docs/docs/http-client/quickstart.md)
- [Common Patterns](../../apps/docs/docs/http-client/common-patterns.md)
- [Ky API Documentation](../../apps/docs/docs/http-client/api/ky.md)
- [Shared core API Documentation](../../apps/docs/docs/http-client/api/core.md)

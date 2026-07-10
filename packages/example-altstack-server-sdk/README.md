# `@alt-stack/example-altstack-server-sdk`

Generated TypeScript/Zod snapshot for the repository's example Altstack HTTP server.

> This is route-specific generated output, not a hand-authored framework API. Regeneration may change any schema or route alias.

## Use the snapshot

```bash
pnpm add @alt-stack/example-altstack-server-sdk @alt-stack/http-client-fetch zod
```

```typescript
import { Request, Response } from "@alt-stack/example-altstack-server-sdk";
import { createApiClient } from "@alt-stack/http-client-fetch";

const api = createApiClient({
  baseUrl: "http://127.0.0.1:3000",
  Request,
  Response,
});
```

Zod 4 is required as a peer. `src/index.ts` is generated and must not be hand-edited.

## Documentation

- [Generated export inventory](../../apps/docs/docs/codegen/api/generated-sdks.md)
- [Code generation Quickstart](../../apps/docs/docs/codegen/quickstart.md)
- [HTTP client Quickstart](../../apps/docs/docs/http-client/quickstart.md)

# `@alt-stack/zod-error`

Small formatting helpers for turning a Zod 4 `ZodError` into human-readable text or structured logging data.

## Install

```bash
pnpm add @alt-stack/zod-error zod
```

## Quickstart

```typescript
import { z } from "zod";
import {
  zodErrorToString,
  zodErrorToStructuredLog,
} from "@alt-stack/zod-error";

const parsed = z.object({ email: z.string().email() }).safeParse({
  email: "not-an-email",
});

if (!parsed.success) {
  console.error(zodErrorToString(parsed.error));
  console.warn(zodErrorToStructuredLog(parsed.error));
}
```

`zodErrorToString` emits `path: message` entries separated by semicolons. `zodErrorToStructuredLog` returns a `StructuredLogError` with `type`, `message`, `issueCount`, and normalized `issues`. Its optional `input` argument is included without redaction, so sanitize sensitive values before passing them.

## Documentation

- [Quickstart](https://altstack-docs.vercel.app/utilities/quickstart)
- [Common patterns](https://altstack-docs.vercel.app/utilities/common-patterns)
- [API Documentation](https://altstack-docs.vercel.app/utilities/api)

## Development

From the repository root:

```bash
pnpm --filter @alt-stack/zod-error check-types
pnpm --filter @alt-stack/zod-error build
```

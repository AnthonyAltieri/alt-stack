# Utilities quickstart

`@alt-stack/zod-error` turns a `ZodError` into text for a human or an object for a structured logging system.

## 1. Install

```bash
pnpm add @alt-stack/zod-error zod
```

The package declares Zod 4 as a peer dependency.

## 2. Parse at a boundary

```typescript
import { z } from "zod";
import { zodErrorToString } from "@alt-stack/zod-error";

const CreateUser = z.object({
  email: z.string().email(),
  age: z.number().int().nonnegative(),
});

const parsed = CreateUser.safeParse({ email: "invalid", age: -1 });

if (!parsed.success) {
  console.error(zodErrorToString(parsed.error));
}
```

Each issue becomes `path: message`; multiple issues are separated with `; `. An issue at the schema root uses `(root)` as its path.

## 3. Emit structured data

```typescript
import { zodErrorToStructuredLog } from "@alt-stack/zod-error";

if (!parsed.success) {
  console.warn(
    "create-user validation failed",
    zodErrorToStructuredLog(parsed.error),
  );
}
```

The returned object contains a stable type, summary, issue count, and normalized issue array.

## What to read next

- [Utilities common patterns](./common-patterns.md) for redaction and log boundaries.
- [Utilities API Documentation](./api.md) for the full output shape.

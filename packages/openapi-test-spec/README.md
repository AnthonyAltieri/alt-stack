# @alt-stack/openapi-test-spec

Shared OpenAPI fixture(s) used as cross-language test vectors.

## What this is

- `openapi.json` is the “master” OpenAPI 3.0 spec that exercises schema permutations we want to support across:
  - OpenAPI → Zod (`packages/zod-openapi`)
  - Zod → OpenAPI/JSON Schema (via `z.toJSONSchema`, and future generators)
  - future language bindings (Python/Pydantic, Go, etc.)

## Conventions

- Uses OpenAPI `3.0.x` (`nullable: true`).
- Uses vendor extensions for test vectors:
  - `x-altstack-examples.valid`: array of values that **must** validate
  - `x-altstack-examples.invalid`: array of values that **must not** validate

## Referencing the fixture

In Node/TS (ESM):

```ts
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const specPath = require.resolve("@alt-stack/openapi-test-spec/openapi.json");
const spec = JSON.parse(readFileSync(specPath, "utf8"));
```


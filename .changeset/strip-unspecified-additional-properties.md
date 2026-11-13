---
"@alt-stack/zod-openapi": minor
---

Add `unspecifiedAdditionalProperties` to `openApiToZodTsCode` and `--unspecified-additional-properties` to the CLI. `"loose"` (the default) keeps today's output. `"strip"` generates an object that has properties but omits `additionalProperties` as `z.object()` without `.loose()`, and its type without the `[key: string]: unknown` index signature, so parsing drops extra keys and discriminated unions narrow. Explicit `additionalProperties: true`, `false`, and schema values generate the same output in both modes.

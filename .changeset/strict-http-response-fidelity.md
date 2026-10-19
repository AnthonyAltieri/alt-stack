---
"@alt-stack/http-client-core": patch
"@alt-stack/http-client-fetch": patch
"@alt-stack/http-client-ky": patch
"@alt-stack/zod-openapi": patch
---

Preserve branded path parameter types and content-free 2xx responses in generated TypeScript SDKs. Branded path fields now require parsed branded identifiers; query, body and unbranded codec inputs keep their existing input semantics.

Generate `z.undefined()` for content-free successes and return `undefined` for empty bodies in both HTTP adapters. Existing schemas that used `z.null()` for empty responses must switch to `z.undefined()`; JSON `null` is unchanged.

Return an unexpected-error result for every undeclared status, including 2xx, with its numeric status and raw response. Declare all expected successes; there is no permissive mode.

Sanitize network failures to `Network request failed` and discard original transport exceptions and request URLs, including timeout causes, so messages, serialization and internal logs cannot expose their contents. Original transport errors are no longer available programmatically.

These packages release together through the repository's existing fixed version group.

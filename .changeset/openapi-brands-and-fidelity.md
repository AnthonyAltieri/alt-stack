---
"@alt-stack/zod-openapi": minor
---

Generate shared branded types from `x-altstack-brand` throughout schemas and route maps.
Reject invalid brand names and conflicting base types.

Generate JSON-only schemas for empty JSON Schema objects, accept RFC 3339 timestamp
offsets, enforce numeric exclusive bounds, and preserve open-object extra keys and
index signatures. Generated output for these constructs intentionally changes.

This minor release also includes the preceding OpenAPI 3.1 anyOf, null, const, and
numeric-enum fixes.

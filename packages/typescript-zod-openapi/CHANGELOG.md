# @alt-stack/zod-openapi

## 1.8.2

## 1.8.1

### Patch Changes

- f1b8b19: Preserve branded path parameter types and content-free 2xx responses in generated TypeScript SDKs. Branded path fields now require parsed branded identifiers; query, body and unbranded codec inputs keep their existing input semantics.

  Generate `z.undefined()` for content-free successes and return `undefined` for empty bodies in both HTTP adapters. Existing schemas that used `z.null()` for empty responses must switch to `z.undefined()`; JSON `null` is unchanged.

  Return an unexpected-error result for every undeclared status, including 2xx, with its numeric status and raw response. Declare all expected successes; there is no permissive mode.

  Sanitize network failures to `Network request failed` and discard original transport exceptions and request URLs, including timeout causes, so messages, serialization and internal logs cannot expose their contents. Original transport errors are no longer available programmatically.

  These packages release together through the repository's existing fixed version group.

## 1.8.0

## 1.7.0

### Minor Changes

- 5faf86f: Generate shared branded types from `x-altstack-brand` throughout schemas and route maps.
  Reject invalid brand names and conflicting base types.

  Generate JSON-only schemas for empty JSON Schema objects, accept RFC 3339 timestamp
  offsets, enforce numeric exclusive bounds, and preserve open-object extra keys and
  index signatures. Generated output for these constructs intentionally changes.

  This minor release also includes the preceding OpenAPI 3.1 anyOf, null, const, and
  numeric-enum fixes.

## 1.6.3

### Patch Changes

- 23f1e5e: Generate matching Zod schemas for OpenAPI 3.1 shapes: `anyOf` compositions (including nullable `anyOf: [T, {type: "null"}]`), bare `type: "null"`, `const` values as literals, and numeric enums as literal unions. Documents exported by Pydantic and FastAPI use these forms; previously the Zod side emitted `z.unknown()` or a loose primitive while the interface side emitted the precise type, so the generated compile-time assertions failed.

## 1.6.2

## 1.6.1

## 1.6.0

## 1.5.1

### Patch Changes

- 773caf0: Enforce generated TypeScript/Zod output equality and preserve schema-valued additional-properties record outputs.

## 1.5.0

## 1.4.0

# @alt-stack/zod-openapi

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

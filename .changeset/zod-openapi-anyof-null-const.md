---
"@alt-stack/zod-openapi": patch
---

Generate matching Zod schemas for OpenAPI 3.1 shapes: `anyOf` compositions (including nullable `anyOf: [T, {type: "null"}]`), bare `type: "null"`, `const` values as literals, and numeric enums as literal unions. Documents exported by Pydantic and FastAPI use these forms; previously the Zod side emitted `z.unknown()` or a loose primitive while the interface side emitted the precise type, so the generated compile-time assertions failed.

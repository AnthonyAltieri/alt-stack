# `@alt-stack/zod-openapi`

Generate TypeScript interfaces, Zod 4 schemas, and typed HTTP `Request`/`Response` maps from OpenAPI JSON.

## Install

```bash
pnpm add zod
pnpm add -D @alt-stack/zod-openapi
```

## Generate

```bash
zod-openapi ./openapi.json --output ./src/generated-api.ts
```

`input` may be a local JSON path or HTTP(S) URL. The CLI also supports `--registry` for executing custom schema registrations, `--include` for inserting required imports/definitions, and `--help`. It always emits route maps; programmatic generation opts in with `includeRoutes`.

```typescript
import { openApiToZodTsCode } from "@alt-stack/zod-openapi";

const source = openApiToZodTsCode(document, undefined, {
  includeRoutes: true,
});
```

Generated files begin with a do-not-edit banner. Change the OpenAPI source, registry/include files, or generator options and regenerate the whole file.

## Branded types

Add `x-altstack-brand` to an identity schema to give its output a nominal type:

```json
{ "type": "string", "format": "uuid", "x-altstack-brand": "UserId" }
```

The generator emits `z.string().uuid().brand<"UserId">()` and exports one shared
`UserId` type, using the package's concrete type-alias convention. References,
parameters, optional and nullable properties, array items, and union members retain
the brand. Parse a value with its generated schema before assigning it to `UserId`.
The TypeScript HTTP clients require parsed branded identifiers for path parameters.
Query parameters and request bodies retain their schema input types, including
unbranded strings. Branding adds no runtime validation beyond the underlying schema.

Names must be ASCII identifiers (`[A-Za-z_][A-Za-z0-9_]*`) and must not be reserved
words or collide with another component type. Reusing a name with incompatible
base types produces a generation error. Each use keeps its own validation constraints.

## Empty success responses

A declared 2xx response without `content` (or with an empty `content` map) emits
`z.undefined()` in the generated `Response` map. For example, a content-free 204
on `/v1/sessions/{id}/logout` produces a success branch with `code: "204"` and
`body: undefined` in both the Fetch and Ky clients. JSON `null` remains `null`;
non-JSON media types are not treated as an empty response.

## Documentation

- [Code generation Quickstart](../../apps/docs/docs/codegen/quickstart.md)
- [Common Patterns](../../apps/docs/docs/codegen/common-patterns.md)
- [TypeScript/Zod OpenAPI API Documentation](../../apps/docs/docs/codegen/api/zod-openapi.md)
- [Generated SDK shapes](../../apps/docs/docs/codegen/api/generated-sdks.md)

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

## Documentation

- [Code generation Quickstart](../../apps/docs/docs/codegen/quickstart.md)
- [Common Patterns](../../apps/docs/docs/codegen/common-patterns.md)
- [TypeScript/Zod OpenAPI API Documentation](../../apps/docs/docs/codegen/api/zod-openapi.md)
- [Generated SDK shapes](../../apps/docs/docs/codegen/api/generated-sdks.md)

# `@alt-stack/openapi-test-spec`

Private cross-language conformance fixture for the TypeScript/Zod, Python/Pydantic, and Rust OpenAPI generators.

This package is not an application SDK. Its only package export is:

```typescript
import document from "@alt-stack/openapi-test-spec/openapi.json";
```

The OpenAPI 3.0 document covers primitives, formats, constraints, arrays, objects, nullable/reference shapes, `oneOf`, `allOf`, route parameters/bodies/responses, and repeated error schemas. `x-altstack-examples.valid` and `.invalid` values drive test assertions; the extension is not a public generator option.

Run the language-specific conformance suites after changing the fixture:

```bash
pnpm --filter @alt-stack/zod-openapi test --run
uv run --project packages/python-pydantic-openapi pytest packages/python-pydantic-openapi/tests/test_master_openapi.py
cargo test -p rust-openapi --test master_openapi
```

See [Generated SDKs and fixtures](../../apps/docs/docs/codegen/api/generated-sdks.md) for its role and [Code generation common patterns](../../apps/docs/docs/codegen/common-patterns.md) for supported-schema differences.

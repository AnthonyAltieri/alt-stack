# Code generation common patterns

## Keep a single authoritative document

Generate from a committed OpenAPI or AsyncAPI artifact. A repeatable package script makes drift visible:

```json
{
  "scripts": {
    "generate:api": "zod-openapi ./openapi.json --output ./src/generated-api.ts",
    "generate:events": "zod-asyncapi ./asyncapi.json --output ./src/generated-events.ts"
  }
}
```

After running the scripts in CI, fail when `git diff --exit-code` finds a change. That proves the committed SDK snapshot matches the committed schema; it does not prove the upstream service actually serves that schema, so verify or download the live artifact first when the service is authoritative.

All generators accept a local file. The CLIs also accept an `http://` or `https://` URL. Network input is fetched once per invocation and HTTP failures terminate generation.

## Choose generated ownership deliberately

Generated output can live in the service repository, a dedicated SDK package, or an application-private module. In every layout:

- put generator configuration and custom types outside the generated file;
- regenerate the entire artifact rather than patching route declarations;
- version the input and generator together when reproducibility matters;
- review generator upgrades as schema/runtime behavior changes, not formatting-only changes.

The repository's `@alt-stack/example-altstack-server-sdk` and `@alt-stack/example-kafka-producer-sdk` are public generated snapshots. The three `examples/real-life/packages/*-sdk` modules are also current generated output, but remain private to that example workspace. See [Generated SDKs and fixtures](./api/generated-sdks.md) for their exact `Request`, `Response`, and `Topics` contracts.

## Add custom types with a registry and include file

TypeScript and Python CLIs separate two jobs:

- `--registry` executes code in the generator process to map an OpenAPI/AsyncAPI primitive or string format to a named runtime schema/type.
- `--include` copies source text near the imports in the generated file so that named value exists when consumers compile or import the output.

You normally need both.

### TypeScript OpenAPI example

`registry.ts`:

```typescript
import { z } from "zod";
import { registerZodSchemaToOpenApiSchema } from "@alt-stack/zod-openapi";

export const ObjectIdSchema = z.string().regex(/^[a-f0-9]{24}$/);

registerZodSchemaToOpenApiSchema(ObjectIdSchema, {
  schemaExportedVariableName: "ObjectIdSchema",
  type: "string",
  format: "objectid",
});
```

`include.ts`:

```typescript
export { ObjectIdSchema } from "./registry.js";
import { ObjectIdSchema } from "./registry.js";
```

```bash
zod-openapi openapi.json --registry ./registry.ts --include ./include.ts --output generated.ts
```

The exported variable name must exactly match the identifier present in generated-module scope. Duplicate `(type, format)` registrations for different Zod schema objects throw.

`@alt-stack/zod-asyncapi` has parallel registry/include flags. Its current converter consults custom string-format registrations; its public primitive registration shape is accepted by the registry but is not consulted during number, integer, or boolean conversion.

### Python example

`registry.py`:

```python
from typing import Annotated
from pydantic import Field
from python_pydantic_openapi import register_pydantic_type_to_openapi_schema

ObjectId = Annotated[str, Field(pattern=r"^[a-f0-9]{24}$")]

register_pydantic_type_to_openapi_schema(
    ObjectId,
    {
        "schema_exported_variable_name": "ObjectId",
        "type": "string",
        "format": "objectid",
        "description": None,
    },
)
```

`include.py`:

```python
from registry import ObjectId
```

```bash
python-pydantic-openapi openapi.json -r registry.py -i include.py -o generated_types.py
```

Python accepts only the string formats in `SUPPORTED_STRING_FORMATS`; an unknown format registration raises `ValueError`. It also supports one custom type per `number`, `integer`, or `boolean` primitive.

### Rust registry

The `rust-openapi` CLI has `--include` but no registry-file flag. Register custom mappings programmatically before calling `openapi_to_rust_code`:

```rust
use rust_openapi::{
    openapi_to_rust_code,
    register_rust_type_to_openapi_schema,
    GenerationOptions,
    RustOpenApiRegistration,
};

register_rust_type_to_openapi_schema(RustOpenApiRegistration {
    rust_type: "crate::ObjectId".to_owned(),
    schema_type: "string".to_owned(),
    format: Some("objectid".to_owned()),
    formats: Vec::new(),
});

let code = openapi_to_rust_code(&document, &GenerationOptions::default());
```

Add the corresponding import or definition through `GenerationOptions.extra_header_lines`. Registrations are process-global; clear them between unrelated generations or tests.

## Understand route output

Only `application/json` request and response content is inspected. Parameters are collected from both the path item and operation. Local `#/components/schemas/...` references are the supported reusable-schema form; external documents and general OpenAPI reference resolution are not performed.

### TypeScript OpenAPI

With `includeRoutes: true`—always enabled by the CLI—the generator emits:

- route-specific Zod schemas for path/query/header/body inputs and each response status;
- `Request[path][METHOD]`, including `{}` for bare methods;
- `Response[path][METHOD][status]` for JSON responses;
- aliases when structurally identical schemas are deduplicated.

This shape plugs into the TypeScript HTTP clients. The client currently does not validate the generated request `headers` schema; pass header values through its request `headers` option.

### Python OpenAPI

With `include_routes`, the generator emits route Pydantic classes and `Request`/`Response` dictionaries containing those classes. Unlike the TypeScript generator, a method with no request parts is absent from `Request`; consult `Response` or the OpenAPI document for bare methods.

### Rust OpenAPI

With routes enabled, the generator emits `request::<path_module>::<method>::Params/Query/Headers/Body` aliases when those parts exist and `response::<path_module>::<method>::StatusNNN` aliases. Bare request methods have no request module. It also re-exports the configured runtime crate as `default_http_client`.

## Design OpenAPI for the supported subset

The generators cover the common JSON Schema vocabulary used by this repository: local component references, objects/properties/required, arrays/items, strings and enums, numbers/integers/booleans, `oneOf`, `allOf`, nullable values, and common constraints. Support is not identical across languages.

| Feature | TypeScript/Zod | Python/Pydantic | Rust/Serde |
| --- | --- | --- | --- |
| `anyOf` | interface typing recognizes it, Zod conversion currently falls back to `z.unknown()` | union | untagged union |
| discriminators | metadata is not used for Zod union selection | Pydantic `Field(discriminator=...)` | untagged Serde enum |
| unspecified extra object fields | Zod object default behavior | generated models allow extras | ignored unless `additionalProperties` is explicit |
| `additionalProperties: false` | `.strict()` | `extra='forbid'` | `deny_unknown_fields` |
| string date/time | Zod validators for `date` and `date-time`; other ISO-named formats remain strings unless registered | constrained `str` plus format metadata unless registered | Chrono types |
| validation constraints | emitted where implemented | emitted as Pydantic `Field` constraints | Rust types do not enforce min/max/pattern constraints |

Consult each API page before adopting less common schema keywords. Unsupported shapes normally degrade to an unknown/dynamic type rather than producing a generator error, so successful generation is not by itself proof of equivalent validation.

## Design AsyncAPI channels for one payload

`@alt-stack/zod-asyncapi` reads AsyncAPI 3-style `channels[*].address` and `channels[*].messages`. It resolves local message references and local component-schema payload references. Top-level `operations` are represented by the exported TypeScript types but are not used in generated output.

Use one effective payload per channel address. The generated `Topics` object has one schema per unique address; multiple channel messages are collapsed to that address rather than represented as a tagged union. Component schemas should appear before dependents in document insertion order, because the current AsyncAPI generator does not topologically reorder component declarations.

For generated TypeScript syntax, keep inline object property names valid JavaScript identifiers. Unlike the OpenAPI generator, the current AsyncAPI object converter does not quote names containing hyphens or other punctuation.

## Keep secrets out of diagnostics

Generator errors can include input paths, URLs, parse messages, and—in Rust client deserialization errors—the full response body. Treat schemas, include files, registry code, generated source, and CI logs according to the sensitivity of the API they describe.

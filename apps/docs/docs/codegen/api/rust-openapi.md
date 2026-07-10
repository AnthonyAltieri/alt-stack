# Rust OpenAPI API Documentation

`rust-openapi` converts OpenAPI JSON/YAML values into Rust 2021 source containing Serde models, route aliases, and an embedded copy of the input document.

The crate is a workspace package in this repository. Add it by path for programmatic use:

```toml
[dependencies]
rust-openapi = { path = "../alt-stack/packages/rust-openapi" }
serde_json = "1"
```

Generated code has its own dependencies—commonly `serde`, `serde_json`, `chrono`, `url`, `uuid`, and the selected HTTP runtime. Use `rust-openapi-crate-gen` when you want a manifest generated with the source.

## CLI: `rust-openapi`

```text
rust-openapi <INPUT> [OPTIONS]
```

| Argument/flag | Meaning |
| --- | --- |
| `INPUT` | Required local path or `http://`/`https://` URL containing OpenAPI JSON or YAML. |
| `-o, --output <PATH>` | Writes generated source to a file; without it, prints source to stdout. |
| `-i, --include <PATH>` | Reads a Rust file and inserts its contents near the top of output. Repeatable. |
| `--no-routes` | Omits request/response route modules and the default HTTP-client re-export. |
| `-h, --help` | Clap-generated help. |

Input parsing tries JSON first and then YAML. URL loading uses Reqwest and reads the response body; there is no CLI timeout, registry-file, or HTTP-header flag. `--include` files are read in command-line order. The CLI default runtime re-export is `http_client_rust_tokio`. I/O, network, and parse errors terminate with a non-zero exit.

The output-file long flag is `--output`.

## `GenerationOptions`

```rust
pub struct GenerationOptions {
    pub include_routes: bool,
    pub extra_header_lines: Vec<String>,
    pub default_http_client_crate: String,
}
```

`Default` sets routes on, no extra lines, and `default_http_client_crate = "http_client_rust_tokio"`.

The configured crate name is inserted as Rust source in `pub use <name> as default_http_client;`; pass a valid in-scope crate path. Extra header strings are inserted verbatim after generated `use` statements and the optional runtime re-export.

## `openapi_to_rust_code`

```rust
pub fn openapi_to_rust_code(
    openapi: &serde_json::Value,
    options: &GenerationOptions,
) -> String;
```

Returns source without writing. Missing or non-object `components.schemas` behaves as an empty map. Components are topologically ordered by local references and emitted as public types. Top-level component names are preserved even when two component shapes are identical; route and nested schemas use fingerprints to reuse or alias an existing canonical shape where the render state has registered one.

Every output includes:

- generated imports and model/type declarations;
- `pub const OPENAPI_JSON: &str`, containing a pretty JSON serialization of the supplied value;
- route types and a `default_http_client` re-export when `include_routes` is true.

With routes enabled, request aliases are grouped under `request::<path_module>::<method>` and may contain `Params`, `Query`, `Headers`, and `Body`. Response aliases are under `response::<path_module>::<method>::Status<code>`. A request method with no typed parts has no request module; a response without `application/json` has no status alias.

Route input only inspects inline parameters plus `application/json` bodies/responses. Parameter objects referenced through `$ref`, other media types, callbacks, links, and external component documents are not resolved.

## `convert_schema_to_rust_type`

```rust
pub fn convert_schema_to_rust_type(schema: &serde_json::Value) -> String;
```

Returns only the rendered type expression. It is useful for scalar/container inspection. For a shape that needs a named declaration—such as a non-empty object or union—it may return a synthetic name such as `GeneratedType` while discarding the declaration accumulated in its private render state. Use `openapi_to_rust_code` for complete compilable definitions.

## Schema mapping

| OpenAPI shape | Rust output |
| --- | --- |
| local `$ref` | referenced type name, URL-decoded |
| string enum | public enum with `#[serde(rename = ...)]` variants |
| `oneOf` / `anyOf` | `#[serde(untagged)]` enum |
| `allOf` | struct with `#[serde(flatten)]` fields |
| string | `String` |
| date / iso-date | `chrono::NaiveDate` |
| date-time / iso-date-time | `chrono::DateTime<Utc>` |
| URI / URL | `url::Url` |
| UUID | `uuid::Uuid` |
| integer / number / boolean | `i64` / `f64` / `bool` |
| array | `Vec<T>` |
| nullable or non-required property | `Option<T>` |
| unknown | `serde_json::Value` |

Non-empty objects become public structs with public fields. Invalid identifiers are converted to snake case, renamed for Serde when necessary, and escaped when they collide with Rust keywords. `additionalProperties: false` adds `deny_unknown_fields`; explicit true or a schema adds a flattened `BTreeMap`; absent `additionalProperties` relies on Serde's default handling and does not preserve unknown fields. Empty free-form objects become `BTreeMap<String, Value>`.

Minimum/maximum, lengths, patterns, and most other validation constraints are not enforced by generated Rust types. Untagged unions use Serde trial order rather than OpenAPI discriminator semantics. Optional and nullable properties both use `Option`, so absence and JSON null are not distinct after decoding.

## Custom registry

### `RustOpenApiRegistration`

```rust
pub struct RustOpenApiRegistration {
    pub rust_type: String,
    pub schema_type: String,
    pub format: Option<String>,
    pub formats: Vec<String>,
}
```

A registration matches when `schema_type` equals the input schema's `type` and either `format` equals the input format (including two absent formats) or the input format occurs in `formats`. `rust_type` is inserted verbatim into generated source.

### Registry functions

- `register_rust_type_to_openapi_schema(registration)` appends to the process-global list. It does not reject duplicates.
- `schema_registry()` returns a cloned snapshot of all registrations.
- `clear_rust_schema_registry()` removes all entries.
- `SUPPORTED_STRING_FORMATS` is the slice `color-hex`, `date`, `date-time`, `email`, `iso-date`, `iso-date-time`, `objectid`, `uri`, `url`, `uuid`.

Lookup uses the first matching registration. Registry access uses a global `RwLock`; a poisoned lock panics with the package's expectation message. Record necessary imports in `extra_header_lines`.

## Dependency helpers

### `extract_schema_dependencies`

```rust
pub fn extract_schema_dependencies(schema: &Value) -> Vec<String>;
```

Recursively finds every local `#/components/schemas/...` reference in arrays and objects. Results are unique and lexicographically ordered. Local names are URL-decoded; other reference forms are ignored.

### `topological_sort_schemas`

```rust
pub fn topological_sort_schemas(
    schemas: &serde_json::Map<String, Value>,
) -> Vec<String>;
```

Returns dependencies before dependents with deterministic lexical traversal. Missing references are ignored, self-references are excluded from dependency edges, and cycles are cut when a node is already being visited rather than reported as errors.

## Route API

`HttpMethod` is a `String` alias.

```rust
pub struct RouteParameter {
    pub name: String,
    pub location: String,
    pub required: bool,
    pub schema: Value,
}

pub struct RouteInfo {
    pub path: String,
    pub method: HttpMethod,
    pub parameters: Vec<RouteParameter>,
    pub request_body: Option<Value>,
    pub responses: Vec<(String, Value)>,
}

pub struct RouteSchemaNames {
    pub params_schema_name: Option<String>,
    pub query_schema_name: Option<String>,
    pub headers_schema_name: Option<String>,
    pub body_schema_name: Option<String>,
}
```

- `parse_openapi_paths(openapi)` visits GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS in that order for each path. It appends path-level parameters before operation-level ones and does not deduplicate them.
- `build_route_schema_name(path, method, suffix)` builds a PascalCase public type name. `method` must be a non-empty string with a valid byte boundary after its first character; ordinary ASCII HTTP methods satisfy that constraint.
- `generate_route_schema_names(route)` returns names for present path/query/header/body shapes. Cookie parameters have no generated name.
- `generate_route_module_name(path)` creates snake-case module names, unwraps path tokens, and uses `root` for `/`.

## Round-trip API

```rust
pub fn rust_code_to_openapi(
    code: &str,
) -> Result<Value, RustCodeToOpenApiError>;
```

Extracts and parses the first generated `OPENAPI_JSON` raw-string literal. It does not reverse-engineer arbitrary Rust types.

`RustCodeToOpenApiError` variants are:

- `MissingEmbeddedOpenApi` when the marker is absent;
- `InvalidEmbeddedLiteral` when raw-string syntax or its terminator is invalid;
- `InvalidJson(serde_json::Error)` when the embedded text is not JSON.

The type implements `Display` and `Error`; only `InvalidJson` exposes a source error.

## Export checklist

The crate root exports `extract_schema_dependencies`, `topological_sort_schemas`, `convert_schema_to_rust_type`, `openapi_to_rust_code`, `GenerationOptions`, `clear_rust_schema_registry`, `register_rust_type_to_openapi_schema`, `schema_registry`, `RustOpenApiRegistration`, `SUPPORTED_STRING_FORMATS`, `rust_code_to_openapi`, `RustCodeToOpenApiError`, `build_route_schema_name`, `generate_route_module_name`, `generate_route_schema_names`, `parse_openapi_paths`, `HttpMethod`, `RouteInfo`, `RouteParameter`, and `RouteSchemaNames`.

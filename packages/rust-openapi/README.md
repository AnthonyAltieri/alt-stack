# rust-openapi

Convert OpenAPI 3.x schemas into Rust models and route request/response modules.

## Features

- Generates Rust structs, enums, and type aliases from component schemas
- Hoists inline object, union, and intersection schemas into named Rust items
- Builds route-specific request/response type aliases from OpenAPI paths
- Exposes a small format registry for custom Rust type mappings
- Defaults generated route integrations to `http-client-rust-tokio`

## CLI

```bash
cargo run -p rust-openapi -- packages/openapi-test-spec/openapi.json
```

Write to a file:

```bash
cargo run -p rust-openapi -- packages/openapi-test-spec/openapi.json -o generated.rs
```

Skip route module generation:

```bash
cargo run -p rust-openapi -- packages/openapi-test-spec/openapi.json --no-routes
```

## Library Usage

```rust
use rust_openapi::{openapi_to_rust_code, GenerationOptions};
use serde_json::json;

let openapi = json!({
    "components": {
        "schemas": {
            "User": {
                "type": "object",
                "properties": {
                    "id": { "type": "string", "format": "uuid" },
                    "name": { "type": "string" }
                },
                "required": ["id", "name"],
                "additionalProperties": false
            }
        }
    }
});

let code = openapi_to_rust_code(&openapi, &GenerationOptions::default());
println!("{code}");
```

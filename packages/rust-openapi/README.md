# `rust-openapi`

Generate Rust 2021 Serde models, route type modules, and an embedded OpenAPI document from JSON or YAML.

This crate is a workspace package in this repository.

## Generate

```bash
cargo run -p rust-openapi -- \
  packages/openapi-test-spec/openapi.json \
  --output /tmp/generated.rs
```

Use repeatable `--include <FILE>` options for extra generated-header source and `--no-routes` for models only. Without `--output`, generated source is printed to stdout.

## Programmatic use

```rust
use rust_openapi::{openapi_to_rust_code, GenerationOptions};

let source = openapi_to_rust_code(&document, &GenerationOptions::default());
```

Generated standalone source needs dependencies matching the emitted types. Use `rust-openapi-crate-gen` to produce a complete manifest and crate layout.

## Documentation

- [Code generation Quickstart](../../apps/docs/docs/codegen/quickstart.md)
- [Common Patterns](../../apps/docs/docs/codegen/common-patterns.md)
- [Rust OpenAPI API Documentation](../../apps/docs/docs/codegen/api/rust-openapi.md)

# `rust-openapi-crate-gen`

Generate a consumable Rust SDK crate (`Cargo.toml`, `src/lib.rs`, and a generated README) from OpenAPI JSON or YAML.

This crate is a workspace package in this repository.

## Generate

```bash
cargo run -p rust-openapi-crate-gen -- \
  packages/openapi-test-spec/openapi.json \
  --package-name example-rust-sdk \
  --output /tmp/example-rust-sdk \
  --runtime-path "$PWD/packages/http-client-rust-tokio"
```

Other options are `--package-version`, `--description`, `--no-routes`, and `--runtime-version`. A supplied `--runtime-path` takes precedence over `--runtime-version`.

```bash
cargo check --manifest-path /tmp/example-rust-sdk/Cargo.toml
```

Generation overwrites the three owned files but does not clean the output directory. Use `generate_rust_crate` for in-memory contents or `write_rust_crate` to write them.

## Documentation

- [Code generation Quickstart](../../apps/docs/docs/codegen/quickstart.md)
- [Common Patterns](../../apps/docs/docs/codegen/common-patterns.md)
- [Crate generator API Documentation](../../apps/docs/docs/codegen/api/rust-crate-gen.md)
- [Generated Rust runtime API Documentation](../../apps/docs/docs/http-client/api/rust-tokio.md)

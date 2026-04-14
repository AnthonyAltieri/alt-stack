# rust-openapi-crate-gen

Generate a consumable Rust crate scaffold from an OpenAPI document.

## Output

The generator writes:

- `Cargo.toml`
- `src/lib.rs`
- `README.md`

`src/lib.rs` is produced by `rust-openapi`, and the generated crate defaults to the `http-client-rust-tokio` runtime.

## CLI

```bash
cargo run -p rust-openapi-crate-gen -- \
  packages/openapi-test-spec/openapi.json \
  --package-name example-rust-sdk \
  --output /tmp/example-rust-sdk \
  --runtime-path /absolute/path/to/packages/http-client-rust-tokio
```

Use a versioned runtime dependency instead:

```bash
cargo run -p rust-openapi-crate-gen -- \
  packages/openapi-test-spec/openapi.json \
  --package-name example-rust-sdk \
  --output /tmp/example-rust-sdk \
  --runtime-version 0.1.0
```

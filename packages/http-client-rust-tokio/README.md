# `http-client-rust-tokio`

Reqwest/Tokio JSON runtime for generated Rust OpenAPI SDKs.

## Add to a crate

```toml
[dependencies]
http-client-rust-tokio = { path = "../alt-stack/packages/http-client-rust-tokio" }
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

This is currently a workspace crate in this repository. Replace the path with a version only when the crate is available from your configured Cargo registry. Generated SDK crates normally re-export the runtime as `default_http_client`.

## Quick use

```rust
use http_client_rust_tokio::{ApiClient, ApiClientOptions, ApiResponse, JsonRequest};

let client = ApiClient::new(ApiClientOptions::new("http://127.0.0.1:3000"));
let request = JsonRequest::new().with_path_param("id", "u_1");

let response = client
    .get::<User, ApiError>("/users/{id}", request)
    .await?;

match response {
    ApiResponse::Success(value) => println!("{}", value.status),
    ApiResponse::Error(value) => eprintln!("{}", value.status),
}
```

All 2xx statuses decode as `TSuccess`; all other statuses decode as `TError`. Serialization, transport, and deserialization failures use `ApiClientError`. The runtime does not add retries or OpenAPI constraint validation.

## Documentation

- [HTTP client Quickstart](../../apps/docs/docs/http-client/quickstart.md)
- [Common Patterns](../../apps/docs/docs/http-client/common-patterns.md)
- [Rust/Tokio API Documentation](../../apps/docs/docs/http-client/api/rust-tokio.md)

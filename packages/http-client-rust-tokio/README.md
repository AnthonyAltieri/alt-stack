# http-client-rust-tokio

Typed JSON HTTP client runtime for generated Rust OpenAPI SDKs.

## Features

- Async Tokio/reqwest transport
- Path interpolation and query serialization helpers
- Typed success/error JSON decoding
- Simple request builder for path params, query, body, headers, and timeout

## Usage

```rust
use http_client_rust_tokio::{ApiClient, ApiClientOptions, JsonRequest};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct User {
    id: String,
    name: String,
}

#[derive(Deserialize)]
struct ApiError {
    code: String,
    message: String,
}

#[derive(Serialize)]
struct UsersQuery {
    limit: u32,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = ApiClient::new(ApiClientOptions::new("https://api.example.com"));
    let request = JsonRequest::new()
        .with_query(&UsersQuery { limit: 10 })?;

    let response = client.get::<Vec<User>, ApiError>("/users", request).await?;
    println!("{}", response.status());
    Ok(())
}
```

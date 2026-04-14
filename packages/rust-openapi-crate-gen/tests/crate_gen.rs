use std::fs;

use rust_openapi_crate_gen::{
    generate_rust_crate, write_rust_crate, RuntimeDependency, RustOpenApiCrateOptions,
};
use serde_json::json;
use tempfile::tempdir;

fn sample_openapi() -> serde_json::Value {
    json!({
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
        },
        "paths": {
            "/users/{id}": {
                "get": {
                    "parameters": [
                        {
                            "name": "id",
                            "in": "path",
                            "required": true,
                            "schema": { "type": "string", "format": "uuid" }
                        }
                    ],
                    "responses": {
                        "200": {
                            "content": {
                                "application/json": {
                                    "schema": { "$ref": "#/components/schemas/User" }
                                }
                            }
                        }
                    }
                }
            }
        }
    })
}

#[test]
fn renders_manifest_readme_and_generated_lib() {
    let mut options = RustOpenApiCrateOptions::new("example-rust-sdk");
    options.runtime_dependency =
        RuntimeDependency::Path("/abs/path/to/http-client-rust-tokio".into());

    let generated =
        generate_rust_crate(&sample_openapi(), &options).expect("crate generation should succeed");

    assert!(generated.cargo_toml.contains("name = \"example-rust-sdk\""));
    assert!(generated
        .cargo_toml
        .contains("http-client-rust-tokio = { path = \"/abs/path/to/http-client-rust-tokio\" }"));
    assert!(generated
        .lib_rs
        .contains("pub use http_client_rust_tokio as default_http_client;"));
    assert!(generated.lib_rs.contains("pub struct User {"));
    assert!(generated
        .readme_md
        .contains("use example_rust_sdk::default_http_client"));
    syn::parse_file(&generated.lib_rs).expect("generated lib should parse");
}

#[test]
fn writes_expected_crate_files_to_disk() {
    let temp_dir = tempdir().expect("tempdir should be created");
    let output_dir = temp_dir.path().join("generated-sdk");

    let mut options = RustOpenApiCrateOptions::new("generated-sdk");
    options.runtime_dependency = RuntimeDependency::Version("0.1.0".into());

    let written = write_rust_crate(&sample_openapi(), &output_dir, &options)
        .expect("crate writing should succeed");

    assert!(written.cargo_toml_path.exists());
    assert!(written.lib_rs_path.exists());
    assert!(written.readme_path.exists());

    let cargo_toml =
        fs::read_to_string(&written.cargo_toml_path).expect("Cargo.toml should be readable");
    let lib_rs = fs::read_to_string(&written.lib_rs_path).expect("lib.rs should be readable");

    assert!(cargo_toml.contains("http-client-rust-tokio = \"0.1.0\""));
    assert!(lib_rs.contains("pub mod request {"));
    assert!(lib_rs.contains("pub mod response {"));
}

#[test]
fn omits_runtime_usage_docs_when_routes_are_disabled() {
    let mut options = RustOpenApiCrateOptions::new("models-only-sdk");
    options.include_routes = false;

    let generated =
        generate_rust_crate(&sample_openapi(), &options).expect("crate generation should succeed");

    assert!(!generated.lib_rs.contains("default_http_client"));
    assert!(!generated
        .readme_md
        .contains("use models_only_sdk::default_http_client"));
    assert!(generated
        .readme_md
        .contains("Route request/response modules were disabled"));
}

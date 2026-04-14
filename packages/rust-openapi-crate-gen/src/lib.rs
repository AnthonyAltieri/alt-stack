use std::{
    fs,
    path::{Path, PathBuf},
};

use rust_openapi::{openapi_to_rust_code, GenerationOptions};
use serde_json::Value;
use thiserror::Error;

pub const DEFAULT_RUNTIME_PACKAGE_NAME: &str = "http-client-rust-tokio";
pub const DEFAULT_RUNTIME_CRATE_NAME: &str = "http_client_rust_tokio";
pub const DEFAULT_RUNTIME_VERSION: &str = "0.1.0";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeDependency {
    Version(String),
    Path(PathBuf),
}

impl Default for RuntimeDependency {
    fn default() -> Self {
        Self::Version(DEFAULT_RUNTIME_VERSION.to_owned())
    }
}

#[derive(Debug, Clone)]
pub struct RustOpenApiCrateOptions {
    pub package_name: String,
    pub package_version: String,
    pub description: Option<String>,
    pub include_routes: bool,
    pub runtime_dependency: RuntimeDependency,
}

impl RustOpenApiCrateOptions {
    pub fn new(package_name: impl Into<String>) -> Self {
        Self {
            package_name: package_name.into(),
            package_version: "0.1.0".to_owned(),
            description: None,
            include_routes: true,
            runtime_dependency: RuntimeDependency::default(),
        }
    }

    pub fn crate_name(&self) -> String {
        self.package_name.replace('-', "_")
    }

    pub fn description(&self) -> String {
        self.description.clone().unwrap_or_else(|| {
            format!(
                "Generated Rust SDK crate for the {} OpenAPI specification",
                self.package_name
            )
        })
    }

    fn validate(&self) -> Result<(), RustOpenApiCrateGenError> {
        if self.package_name.trim().is_empty() {
            return Err(RustOpenApiCrateGenError::InvalidPackageName(
                "package name cannot be empty".to_owned(),
            ));
        }
        if self.package_name.chars().any(|character| {
            !(character.is_ascii_alphanumeric() || character == '-' || character == '_')
        }) {
            return Err(RustOpenApiCrateGenError::InvalidPackageName(
                "package name must contain only ASCII letters, numbers, hyphens, or underscores"
                    .to_owned(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GeneratedRustCrate {
    pub cargo_toml: String,
    pub lib_rs: String,
    pub readme_md: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WrittenRustCrate {
    pub root_dir: PathBuf,
    pub cargo_toml_path: PathBuf,
    pub lib_rs_path: PathBuf,
    pub readme_path: PathBuf,
}

#[derive(Debug, Error)]
pub enum RustOpenApiCrateGenError {
    #[error("{0}")]
    InvalidPackageName(String),
    #[error("failed to write generated crate files: {0}")]
    Io(#[from] std::io::Error),
}

pub fn generate_rust_crate(
    openapi: &Value,
    options: &RustOpenApiCrateOptions,
) -> Result<GeneratedRustCrate, RustOpenApiCrateGenError> {
    options.validate()?;

    let lib_rs = openapi_to_rust_code(
        openapi,
        &GenerationOptions {
            include_routes: options.include_routes,
            extra_header_lines: Vec::new(),
            default_http_client_crate: DEFAULT_RUNTIME_CRATE_NAME.to_owned(),
        },
    );

    Ok(GeneratedRustCrate {
        cargo_toml: render_cargo_toml(options),
        lib_rs,
        readme_md: render_readme(options),
    })
}

pub fn write_rust_crate(
    openapi: &Value,
    output_dir: impl AsRef<Path>,
    options: &RustOpenApiCrateOptions,
) -> Result<WrittenRustCrate, RustOpenApiCrateGenError> {
    let output_dir = output_dir.as_ref();
    let generated = generate_rust_crate(openapi, options)?;

    let src_dir = output_dir.join("src");
    fs::create_dir_all(&src_dir)?;

    let cargo_toml_path = output_dir.join("Cargo.toml");
    let lib_rs_path = src_dir.join("lib.rs");
    let readme_path = output_dir.join("README.md");

    fs::write(&cargo_toml_path, generated.cargo_toml)?;
    fs::write(&lib_rs_path, generated.lib_rs)?;
    fs::write(&readme_path, generated.readme_md)?;

    Ok(WrittenRustCrate {
        root_dir: output_dir.to_path_buf(),
        cargo_toml_path,
        lib_rs_path,
        readme_path,
    })
}

fn render_cargo_toml(options: &RustOpenApiCrateOptions) -> String {
    let runtime_dependency = match &options.runtime_dependency {
        RuntimeDependency::Version(version) => {
            format!("{DEFAULT_RUNTIME_PACKAGE_NAME} = \"{version}\"")
        }
        RuntimeDependency::Path(path) => format!(
            "{DEFAULT_RUNTIME_PACKAGE_NAME} = {{ path = {:?} }}",
            path.to_string_lossy()
        ),
    };

    format!(
        r#"[package]
name = "{package_name}"
version = "{package_version}"
edition = "2021"
license = "MIT"
description = {description:?}

[dependencies]
chrono = {{ version = "0.4.42", features = ["serde"] }}
{runtime_dependency}
serde = {{ version = "1.0.228", features = ["derive"] }}
serde_json = "1.0.145"
url = {{ version = "2.5.7", features = ["serde"] }}
uuid = {{ version = "1.18.1", features = ["serde", "v4"] }}
"#,
        package_name = options.package_name,
        package_version = options.package_version,
        description = options.description(),
        runtime_dependency = runtime_dependency,
    )
}

fn render_readme(options: &RustOpenApiCrateOptions) -> String {
    let crate_name = options.crate_name();
    if options.include_routes {
        return format!(
            r#"# {package_name}

Generated Rust SDK crate for the `{package_name}` OpenAPI specification.

## Usage

```rust
use {crate_name}::default_http_client::{{ApiClient, ApiClientOptions, JsonRequest}};

let client = ApiClient::new(ApiClientOptions::new("https://api.example.com"));
let request = JsonRequest::new();

let _ = client;
let _ = request;
```

## Notes

- `src/lib.rs` is generated from OpenAPI via `rust-openapi`.
- The default runtime dependency is `{runtime_package}`.
"#,
            package_name = options.package_name,
            crate_name = crate_name,
            runtime_package = DEFAULT_RUNTIME_PACKAGE_NAME,
        );
    }

    format!(
        r#"# {package_name}

Generated Rust model crate for the `{package_name}` OpenAPI specification.

## Usage

```rust
use {crate_name}::*;
```

## Notes

- `src/lib.rs` is generated from OpenAPI via `rust-openapi`.
- Route request/response modules were disabled when this crate was generated.
- No `default_http_client` re-export is included in this mode.
"#,
        package_name = options.package_name,
        crate_name = crate_name,
    )
}

# Rust OpenAPI crate generator API Documentation

`rust-openapi-crate-gen` wraps `rust-openapi` and produces a three-file SDK crate:

```text
<output>/
├── Cargo.toml
├── README.md
└── src/lib.rs
```

The package is currently a Rust workspace crate in this repository.

## CLI: `rust-openapi-crate-gen`

```text
rust-openapi-crate-gen <INPUT> --package-name <NAME> --output <DIR> [OPTIONS]
```

| Argument/flag | Meaning |
| --- | --- |
| `INPUT` | Required local path or `http://`/`https://` URL containing JSON or YAML. |
| `--package-name <NAME>` | Required generated Cargo package name. |
| `-o, --output <DIR>` | Required output directory. |
| `--package-version <VERSION>` | Package version; defaults to `0.1.0`. |
| `--description <TEXT>` | Optional manifest description. |
| `--no-routes` | Omits route modules and the runtime re-export. |
| `--runtime-path <PATH>` | Writes a path dependency for `http-client-rust-tokio`. Takes precedence over runtime version. |
| `--runtime-version <VERSION>` | Versioned runtime dependency; defaults to `0.1.0`. |
| `-h, --help` | Clap-generated help. |

Input parsing tries JSON and then YAML. URL loading uses Reqwest without CLI request-header or timeout options. The generator creates the output and `src` directories as needed, then overwrites `Cargo.toml`, `src/lib.rs`, and `README.md`; it does not remove other existing files.

The required/configurable long flags are `--package-name`, `--output`, `--package-version`, `--description`, `--runtime-path`, and `--runtime-version`.

## Constants

- `DEFAULT_RUNTIME_PACKAGE_NAME` is `"http-client-rust-tokio"` (Cargo package/dependency key).
- `DEFAULT_RUNTIME_CRATE_NAME` is `"http_client_rust_tokio"` (Rust source identifier).
- `DEFAULT_RUNTIME_VERSION` is `"0.1.0"`; it supplies the versioned `http-client-rust-tokio` dependency when callers do not select a path or override the version.

## `RuntimeDependency`

```rust
pub enum RuntimeDependency {
    Version(String),
    Path(PathBuf),
}
```

`Default` is `Version(DEFAULT_RUNTIME_VERSION.to_owned())`. A version renders as `http-client-rust-tokio = "..."`; a path renders as a Cargo path dependency using the path's lossy string form.

## `RustOpenApiCrateOptions`

```rust
pub struct RustOpenApiCrateOptions {
    pub package_name: String,
    pub package_version: String,
    pub description: Option<String>,
    pub include_routes: bool,
    pub runtime_dependency: RuntimeDependency,
}
```

`RustOpenApiCrateOptions::new(package_name)` defaults version to `0.1.0`, description to none, routes to true, and the runtime to its default version.

Methods:

- `crate_name()` replaces `-` with `_`; it does not otherwise sanitize the package name.
- `description()` returns the explicit description or `Generated Rust SDK crate for the <package> OpenAPI specification`.

Generation rejects an empty/whitespace-only package name and any character outside ASCII letters, digits, `-`, and `_`. It does not validate Cargo's complete naming/version rules; for example, downstream `cargo check` remains the authoritative manifest validation.

## Generated result types

```rust
pub struct GeneratedRustCrate {
    pub cargo_toml: String,
    pub lib_rs: String,
    pub readme_md: String,
}

pub struct WrittenRustCrate {
    pub root_dir: PathBuf,
    pub cargo_toml_path: PathBuf,
    pub lib_rs_path: PathBuf,
    pub readme_path: PathBuf,
}
```

`GeneratedRustCrate` is an in-memory artifact. `WrittenRustCrate` reports every path written to disk.

## `generate_rust_crate`

```rust
pub fn generate_rust_crate(
    openapi: &serde_json::Value,
    options: &RustOpenApiCrateOptions,
) -> Result<GeneratedRustCrate, RustOpenApiCrateGenError>;
```

Validates options and returns all three file contents. `src/lib.rs` comes from `rust-openapi` with no extra header lines and `DEFAULT_RUNTIME_CRATE_NAME` as the route runtime. When routes are disabled, there is no runtime re-export, though the generated manifest still includes the configured runtime dependency.

The manifest uses edition 2021, MIT, and fixed generated-code dependencies:

- `chrono 0.4.42` with Serde;
- `serde 1.0.228` with derive;
- `serde_json 1.0.145`;
- `url 2.5.7` with Serde;
- `uuid 1.18.1` with Serde and v4;
- the selected `http-client-rust-tokio` dependency.

These versions are generator output constants, not inherited from the consuming workspace.

The generated README shows runtime setup when routes are on and a models-only import when routes are off. It is generated output and will be overwritten by the next scaffold operation.

## `write_rust_crate`

```rust
pub fn write_rust_crate(
    openapi: &Value,
    output_dir: impl AsRef<Path>,
    options: &RustOpenApiCrateOptions,
) -> Result<WrittenRustCrate, RustOpenApiCrateGenError>;
```

Calls `generate_rust_crate`, creates `<output>/src`, writes the three files, and returns their paths. Writes are sequential and not transactional: an I/O failure can leave a partially updated output directory.

## `RustOpenApiCrateGenError`

```rust
pub enum RustOpenApiCrateGenError {
    InvalidPackageName(String),
    Io(std::io::Error),
}
```

The error derives `thiserror::Error`. `Io` is created through `From<std::io::Error>`. JSON/YAML and network failures are handled by the CLI before this library API is called and therefore are not variants of this enum.

## Export checklist

The library exports `DEFAULT_RUNTIME_PACKAGE_NAME`, `DEFAULT_RUNTIME_CRATE_NAME`, `DEFAULT_RUNTIME_VERSION`, `RuntimeDependency`, `RustOpenApiCrateOptions` and its three methods, `GeneratedRustCrate`, `WrittenRustCrate`, `RustOpenApiCrateGenError`, `generate_rust_crate`, and `write_rust_crate`.

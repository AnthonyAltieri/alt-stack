use std::{fs, path::PathBuf};

use clap::Parser;
use rust_openapi_crate_gen::{write_rust_crate, RuntimeDependency, RustOpenApiCrateOptions};
use serde_json::Value;

#[derive(Debug, Parser)]
#[command(name = "rust-openapi-crate-gen")]
#[command(about = "Generate a Rust crate scaffold from an OpenAPI document")]
struct Cli {
    /// Path or URL to an OpenAPI JSON/YAML document
    input: String,
    /// Generated Cargo package name
    #[arg(long = "package-name")]
    package_name: String,
    /// Output directory for the generated crate
    #[arg(short, long)]
    output: PathBuf,
    /// Override the generated package version
    #[arg(long = "package-version", default_value = "0.1.0")]
    package_version: String,
    /// Optional package description
    #[arg(long)]
    description: Option<String>,
    /// Skip route request/response module generation
    #[arg(long = "no-routes", default_value_t = false)]
    no_routes: bool,
    /// Use a local runtime path instead of a versioned dependency
    #[arg(long = "runtime-path")]
    runtime_path: Option<PathBuf>,
    /// Override the versioned runtime dependency when runtime-path is not provided
    #[arg(long = "runtime-version", default_value = "0.1.0")]
    runtime_version: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let document = load_input(&cli.input).await?;
    let openapi = parse_openapi_document(&document)?;

    let runtime_dependency = match cli.runtime_path {
        Some(path) => RuntimeDependency::Path(path),
        None => RuntimeDependency::Version(cli.runtime_version),
    };

    let mut options = RustOpenApiCrateOptions::new(cli.package_name);
    options.package_version = cli.package_version;
    options.description = cli.description;
    options.include_routes = !cli.no_routes;
    options.runtime_dependency = runtime_dependency;

    write_rust_crate(&openapi, &cli.output, &options)?;
    Ok(())
}

async fn load_input(input: &str) -> Result<String, Box<dyn std::error::Error>> {
    if input.starts_with("http://") || input.starts_with("https://") {
        return Ok(reqwest::get(input).await?.text().await?);
    }

    Ok(fs::read_to_string(input)?)
}

fn parse_openapi_document(document: &str) -> Result<Value, Box<dyn std::error::Error>> {
    if let Ok(json) = serde_json::from_str(document) {
        return Ok(json);
    }
    Ok(serde_yaml::from_str(document)?)
}

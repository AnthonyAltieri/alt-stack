use std::{fs, path::PathBuf};

use clap::Parser;
use rust_openapi::{openapi_to_rust_code, GenerationOptions};
use serde_json::Value;

#[derive(Debug, Parser)]
#[command(name = "rust-openapi")]
#[command(about = "Convert OpenAPI documents into Rust models and route modules")]
struct Cli {
    /// Path or URL to an OpenAPI JSON/YAML document
    input: String,
    /// Write output to a file instead of stdout
    #[arg(short, long)]
    output: Option<PathBuf>,
    /// Include one or more Rust files at the top of the generated output
    #[arg(short = 'i', long = "include")]
    include: Vec<PathBuf>,
    /// Skip route request/response module generation
    #[arg(long = "no-routes", default_value_t = false)]
    no_routes: bool,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let document = load_input(&cli.input).await?;
    let openapi = parse_openapi_document(&document)?;

    let extra_header_lines = cli
        .include
        .iter()
        .map(fs::read_to_string)
        .collect::<Result<Vec<_>, _>>()?;

    let code = openapi_to_rust_code(
        &openapi,
        &GenerationOptions {
            include_routes: !cli.no_routes,
            extra_header_lines,
            default_http_client_crate: "http_client_rust_tokio".to_owned(),
        },
    );

    if let Some(output) = cli.output {
        fs::write(output, code)?;
    } else {
        println!("{code}");
    }

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

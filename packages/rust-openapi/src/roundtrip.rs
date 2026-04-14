use std::{error::Error, fmt};

use serde_json::Value;

const OPENAPI_JSON_MARKER: &str = "pub const OPENAPI_JSON: &str = r";

#[derive(Debug)]
pub enum RustCodeToOpenApiError {
    MissingEmbeddedOpenApi,
    InvalidEmbeddedLiteral,
    InvalidJson(serde_json::Error),
}

impl fmt::Display for RustCodeToOpenApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingEmbeddedOpenApi => f.write_str(
                "generated Rust code does not contain an embedded OPENAPI_JSON constant",
            ),
            Self::InvalidEmbeddedLiteral => {
                f.write_str("generated Rust code contains an invalid embedded OPENAPI_JSON literal")
            }
            Self::InvalidJson(error) => {
                write!(f, "embedded OPENAPI_JSON is not valid JSON: {error}")
            }
        }
    }
}

impl Error for RustCodeToOpenApiError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::InvalidJson(error) => Some(error),
            _ => None,
        }
    }
}

pub fn rust_code_to_openapi(code: &str) -> Result<Value, RustCodeToOpenApiError> {
    let marker_index = code
        .find(OPENAPI_JSON_MARKER)
        .ok_or(RustCodeToOpenApiError::MissingEmbeddedOpenApi)?;
    let after_marker = &code[marker_index + OPENAPI_JSON_MARKER.len()..];

    let hash_count = after_marker
        .chars()
        .take_while(|character| *character == '#')
        .count();
    let after_hashes = &after_marker[hash_count..];
    if !after_hashes.starts_with('"') {
        return Err(RustCodeToOpenApiError::InvalidEmbeddedLiteral);
    }

    let body = &after_hashes[1..];
    let terminator = format!("\"{};", "#".repeat(hash_count));
    let end_index = body
        .find(&terminator)
        .ok_or(RustCodeToOpenApiError::InvalidEmbeddedLiteral)?;
    let embedded_json = &body[..end_index];

    serde_json::from_str(embedded_json).map_err(RustCodeToOpenApiError::InvalidJson)
}

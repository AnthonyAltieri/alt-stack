use std::sync::{OnceLock, RwLock};

use serde_json::Value;

pub const SUPPORTED_STRING_FORMATS: &[&str] = &[
    "color-hex",
    "date",
    "date-time",
    "email",
    "iso-date",
    "iso-date-time",
    "objectid",
    "uri",
    "url",
    "uuid",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RustOpenApiRegistration {
    pub rust_type: String,
    pub schema_type: String,
    pub format: Option<String>,
    pub formats: Vec<String>,
}

impl RustOpenApiRegistration {
    fn matches(&self, schema_type: &str, format: Option<&str>) -> bool {
        if self.schema_type != schema_type {
            return false;
        }
        if self.format.as_deref() == format {
            return true;
        }
        format
            .map(|value| self.formats.iter().any(|candidate| candidate == value))
            .unwrap_or(false)
    }
}

fn registry_lock() -> &'static RwLock<Vec<RustOpenApiRegistration>> {
    static REGISTRY: OnceLock<RwLock<Vec<RustOpenApiRegistration>>> = OnceLock::new();
    REGISTRY.get_or_init(|| RwLock::new(Vec::new()))
}

pub fn schema_registry() -> Vec<RustOpenApiRegistration> {
    registry_lock()
        .read()
        .expect("registry should be readable")
        .clone()
}

pub fn clear_rust_schema_registry() {
    registry_lock()
        .write()
        .expect("registry should be writable")
        .clear();
}

pub fn register_rust_type_to_openapi_schema(registration: RustOpenApiRegistration) {
    registry_lock()
        .write()
        .expect("registry should be writable")
        .push(registration);
}

pub(crate) fn lookup_registered_rust_type(schema: &Value) -> Option<String> {
    let schema_type = schema.get("type").and_then(Value::as_str)?;
    let format = schema.get("format").and_then(Value::as_str);
    registry_lock()
        .read()
        .expect("registry should be readable")
        .iter()
        .find(|registration| registration.matches(schema_type, format))
        .map(|registration| registration.rust_type.clone())
}

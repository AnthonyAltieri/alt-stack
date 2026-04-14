use std::fs;

use rust_openapi::{openapi_to_rust_code, rust_code_to_openapi, GenerationOptions};
use serde_json::Value;

#[test]
fn generates_rust_code_for_repository_openapi_fixture() {
    let fixture = fs::read_to_string("../openapi-test-spec/openapi.json")
        .expect("openapi fixture should be readable");
    let openapi: Value = serde_json::from_str(&fixture).expect("fixture should be valid json");

    let generated = openapi_to_rust_code(&openapi, &GenerationOptions::default());

    assert!(generated.contains("pub enum StringEnum {"));
    assert!(generated.contains("pub struct User {"));
    assert!(generated.contains("pub enum Pet {"));
    assert!(generated.contains("pub struct NamedTimestamped {"));
    assert!(generated.contains("pub type NullableUser = Option<User>;"));
    assert!(generated.contains("pub struct GetUsersIdParams {"));
    assert!(generated.contains("pub const OPENAPI_JSON: &str = "));
    assert!(generated.contains("pub fn openapi_document() -> serde_json::Value {"));
    assert!(generated.contains("pub mod request {"));
    assert!(generated.contains("pub mod response {"));
    syn::parse_file(&generated).expect("generated fixture code should parse");
}

#[test]
fn roundtrips_repository_openapi_fixture_from_generated_rust_code() {
    let fixture = fs::read_to_string("../openapi-test-spec/openapi.json")
        .expect("openapi fixture should be readable");
    let openapi: Value = serde_json::from_str(&fixture).expect("fixture should be valid json");

    let generated = openapi_to_rust_code(&openapi, &GenerationOptions::default());
    let extracted = rust_code_to_openapi(&generated).expect("generated Rust should embed OpenAPI");

    assert_eq!(
        stable_json_stringify(&extracted),
        stable_json_stringify(&openapi)
    );
}

fn stable_json_stringify(value: &Value) -> String {
    serde_json::to_string_pretty(&sort_keys_deep(value))
        .expect("sorted OpenAPI document should serialize")
}

fn sort_keys_deep(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(sort_keys_deep).collect()),
        Value::Object(object) => {
            let mut sorted = serde_json::Map::new();
            let mut keys = object.keys().cloned().collect::<Vec<_>>();
            keys.sort();
            for key in keys {
                sorted.insert(key.clone(), sort_keys_deep(&object[&key]));
            }
            Value::Object(sorted)
        }
        _ => value.clone(),
    }
}

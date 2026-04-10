use std::fs;

use rust_openapi::{openapi_to_rust_code, GenerationOptions};
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
    assert!(generated.contains("pub mod request {"));
    assert!(generated.contains("pub mod response {"));
    syn::parse_file(&generated).expect("generated fixture code should parse");
}

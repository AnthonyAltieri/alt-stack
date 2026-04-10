use rust_openapi::{
    clear_rust_schema_registry, convert_schema_to_rust_type, openapi_to_rust_code,
    register_rust_type_to_openapi_schema, GenerationOptions, RustOpenApiRegistration,
};
use serde_json::json;

#[test]
fn converts_basic_schemas_to_rust_types() {
    assert_eq!(
        convert_schema_to_rust_type(&json!({ "type": "string" })),
        "String"
    );
    assert_eq!(
        convert_schema_to_rust_type(&json!({ "type": "integer" })),
        "i64"
    );
    assert_eq!(
        convert_schema_to_rust_type(&json!({ "type": "array", "items": { "type": "boolean" } })),
        "Vec<bool>"
    );
    assert_eq!(
        convert_schema_to_rust_type(
            &json!({ "$ref": "#/components/schemas/User", "nullable": true })
        ),
        "Option<User>"
    );
}

#[test]
fn uses_registered_custom_types_for_matching_formats() {
    clear_rust_schema_registry();
    register_rust_type_to_openapi_schema(RustOpenApiRegistration {
        rust_type: "CustomUuid".into(),
        schema_type: "string".into(),
        format: Some("uuid".into()),
        formats: Vec::new(),
    });

    let generated = convert_schema_to_rust_type(&json!({ "type": "string", "format": "uuid" }));
    assert_eq!(generated, "CustomUuid");

    clear_rust_schema_registry();
}

#[test]
fn generates_models_routes_and_default_client_alias() {
    let openapi = json!({
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
                        { "name": "id", "in": "path", "required": true, "schema": { "type": "string", "format": "uuid" } }
                    ],
                    "responses": {
                        "200": {
                            "content": {
                                "application/json": { "schema": { "$ref": "#/components/schemas/User" } }
                            }
                        }
                    }
                }
            }
        }
    });

    let generated = openapi_to_rust_code(&openapi, &GenerationOptions::default());
    assert!(generated.contains("pub use http_client_rust_tokio as default_http_client;"));
    assert!(generated.contains("pub struct User {"));
    assert!(generated.contains("pub type GetUsersId200Response = User;"));
    assert!(generated.contains("pub struct GetUsersIdParams {"));
    assert!(generated.contains("pub mod request {"));
    assert!(generated.contains("pub mod response {"));
    syn::parse_file(&generated).expect("generated Rust should parse");
}

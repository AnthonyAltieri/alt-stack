use rust_openapi::{extract_schema_dependencies, topological_sort_schemas};
use serde_json::json;

#[test]
fn extracts_component_references_from_nested_schemas() {
    let schema = json!({
        "type": "object",
        "properties": {
            "users": {
                "type": "array",
                "items": { "$ref": "#/components/schemas/User" }
            },
            "profile": {
                "type": "object",
                "properties": {
                    "owner": { "$ref": "#/components/schemas/Profile" }
                }
            }
        }
    });

    let dependencies = extract_schema_dependencies(&schema);
    assert_eq!(dependencies, vec!["Profile".to_owned(), "User".to_owned()]);
}

#[test]
fn sorts_schemas_by_dependency_order() {
    let schemas = json!({
        "User": {
            "type": "object",
            "properties": { "profile": { "$ref": "#/components/schemas/Profile" } }
        },
        "Profile": {
            "type": "object",
            "properties": { "id": { "type": "string" } }
        }
    });

    let ordered =
        topological_sort_schemas(schemas.as_object().expect("schemas should be an object"));

    assert_eq!(ordered, vec!["Profile".to_owned(), "User".to_owned()]);
}

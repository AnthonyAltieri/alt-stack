use rust_openapi::{
    build_route_schema_name, generate_route_module_name, generate_route_schema_names,
    parse_openapi_paths,
};
use serde_json::json;

#[test]
fn parses_openapi_paths_into_route_info() {
    let openapi = json!({
        "paths": {
            "/users/{id}": {
                "get": {
                    "parameters": [
                        { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } },
                        { "name": "limit", "in": "query", "required": false, "schema": { "type": "integer" } }
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

    let routes = parse_openapi_paths(&openapi);
    assert_eq!(routes.len(), 1);
    assert_eq!(routes[0].path, "/users/{id}");
    assert_eq!(routes[0].method, "GET");
    assert_eq!(routes[0].parameters.len(), 2);
}

#[test]
fn generates_route_schema_names_and_module_names() {
    let openapi = json!({
        "paths": {
            "/users/{id}": {
                "get": {
                    "parameters": [
                        { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
                    ],
                    "requestBody": {
                        "content": {
                            "application/json": { "schema": { "type": "object", "properties": {} } }
                        }
                    },
                    "responses": {}
                }
            }
        }
    });

    let routes = parse_openapi_paths(&openapi);
    let names = generate_route_schema_names(&routes[0]);

    assert_eq!(
        build_route_schema_name("/users/{id}", "GET", "Params"),
        "GetUsersIdParams"
    );
    assert_eq!(generate_route_module_name("/users/{id}"), "users_id");
    assert_eq!(
        names.params_schema_name.as_deref(),
        Some("GetUsersIdParams")
    );
    assert_eq!(names.body_schema_name.as_deref(), Some("GetUsersIdBody"));
}

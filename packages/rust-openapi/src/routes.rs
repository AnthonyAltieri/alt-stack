use serde_json::{Map, Value};

pub type HttpMethod = String;

#[derive(Debug, Clone, PartialEq)]
pub struct RouteParameter {
    pub name: String,
    pub location: String,
    pub required: bool,
    pub schema: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RouteInfo {
    pub path: String,
    pub method: HttpMethod,
    pub parameters: Vec<RouteParameter>,
    pub request_body: Option<Value>,
    pub responses: Vec<(String, Value)>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RouteSchemaNames {
    pub params_schema_name: Option<String>,
    pub query_schema_name: Option<String>,
    pub headers_schema_name: Option<String>,
    pub body_schema_name: Option<String>,
}

pub fn parse_openapi_paths(openapi: &Value) -> Vec<RouteInfo> {
    let Some(paths) = openapi.get("paths").and_then(Value::as_object) else {
        return Vec::new();
    };

    let mut routes = Vec::new();
    let methods = ["get", "post", "put", "patch", "delete", "head", "options"];

    for (path, path_item) in paths {
        let Some(path_item_object) = path_item.as_object() else {
            continue;
        };

        for method in methods {
            let Some(operation) = path_item_object.get(method).and_then(Value::as_object) else {
                continue;
            };

            let mut parameters = Vec::new();
            collect_parameters(path_item_object.get("parameters"), &mut parameters);
            collect_parameters(operation.get("parameters"), &mut parameters);

            let request_body = extract_request_body(operation);
            let responses = extract_responses(operation);

            routes.push(RouteInfo {
                path: path.clone(),
                method: method.to_ascii_uppercase(),
                parameters,
                request_body,
                responses,
            });
        }
    }

    routes
}

fn collect_parameters(value: Option<&Value>, parameters: &mut Vec<RouteParameter>) {
    let Some(items) = value.and_then(Value::as_array) else {
        return;
    };

    for item in items {
        let Some(object) = item.as_object() else {
            continue;
        };
        parameters.push(RouteParameter {
            name: object
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            location: object
                .get("in")
                .and_then(Value::as_str)
                .unwrap_or("query")
                .to_owned(),
            required: object
                .get("required")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            schema: object
                .get("schema")
                .cloned()
                .unwrap_or(Value::Object(Map::new())),
        });
    }
}

fn extract_request_body(operation: &Map<String, Value>) -> Option<Value> {
    operation
        .get("requestBody")
        .and_then(Value::as_object)
        .and_then(|body| body.get("content"))
        .and_then(Value::as_object)
        .and_then(|content| content.get("application/json"))
        .and_then(Value::as_object)
        .and_then(|json| json.get("schema"))
        .cloned()
}

fn extract_responses(operation: &Map<String, Value>) -> Vec<(String, Value)> {
    let Some(responses) = operation.get("responses").and_then(Value::as_object) else {
        return Vec::new();
    };

    let mut extracted = Vec::new();
    for (status, value) in responses {
        let Some(response) = value.as_object() else {
            continue;
        };
        let Some(schema) = response
            .get("content")
            .and_then(Value::as_object)
            .and_then(|content| content.get("application/json"))
            .and_then(Value::as_object)
            .and_then(|json| json.get("schema"))
        else {
            continue;
        };
        extracted.push((status.clone(), schema.clone()));
    }

    extracted
}

pub fn build_route_schema_name(path: &str, method: &str, suffix: &str) -> String {
    let path_parts = path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            if segment.starts_with('{') && segment.ends_with('}') {
                segment[1..segment.len() - 1].to_owned()
            } else {
                segment.to_owned()
            }
        })
        .map(|segment| to_pascal_case(&segment))
        .collect::<Vec<_>>();

    let method_prefix = format!(
        "{}{}",
        method.chars().next().unwrap_or('G').to_ascii_uppercase(),
        method[1..].to_ascii_lowercase()
    );

    std::iter::once(method_prefix)
        .chain(path_parts)
        .chain(std::iter::once(suffix.to_owned()))
        .collect()
}

pub fn generate_route_schema_names(route: &RouteInfo) -> RouteSchemaNames {
    let mut names = RouteSchemaNames::default();

    if route
        .parameters
        .iter()
        .any(|parameter| parameter.location == "path")
    {
        names.params_schema_name = Some(build_route_schema_name(
            &route.path,
            &route.method,
            "Params",
        ));
    }
    if route
        .parameters
        .iter()
        .any(|parameter| parameter.location == "query")
    {
        names.query_schema_name =
            Some(build_route_schema_name(&route.path, &route.method, "Query"));
    }
    if route
        .parameters
        .iter()
        .any(|parameter| parameter.location == "header")
    {
        names.headers_schema_name = Some(build_route_schema_name(
            &route.path,
            &route.method,
            "Headers",
        ));
    }
    if route.request_body.is_some() {
        names.body_schema_name = Some(build_route_schema_name(&route.path, &route.method, "Body"));
    }

    names
}

pub fn generate_route_module_name(path: &str) -> String {
    let joined = path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            if segment.starts_with('{') && segment.ends_with('}') {
                segment[1..segment.len() - 1].to_owned()
            } else {
                segment.to_owned()
            }
        })
        .collect::<Vec<_>>()
        .join("_");

    let name = to_snake_case(&joined);
    if name.is_empty() {
        "root".to_owned()
    } else {
        name
    }
}

fn to_pascal_case(value: &str) -> String {
    value
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            let mut characters = segment.chars();
            let first = characters
                .next()
                .map(|character| character.to_ascii_uppercase())
                .unwrap_or('X');
            let rest = if segment
                .chars()
                .all(|character| !character.is_ascii_lowercase())
            {
                characters.as_str().to_ascii_lowercase()
            } else {
                characters.as_str().to_owned()
            };
            format!("{first}{rest}")
        })
        .collect()
}

fn to_snake_case(value: &str) -> String {
    let mut result = String::new();
    let mut previous_was_separator = true;

    for character in value.chars() {
        if !character.is_ascii_alphanumeric() {
            if !previous_was_separator {
                result.push('_');
            }
            previous_was_separator = true;
            continue;
        }

        if character.is_ascii_uppercase() && !previous_was_separator && !result.ends_with('_') {
            result.push('_');
        }
        result.push(character.to_ascii_lowercase());
        previous_was_separator = false;
    }

    result.trim_matches('_').to_owned()
}

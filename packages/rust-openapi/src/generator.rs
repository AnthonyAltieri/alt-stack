use std::collections::{BTreeMap, BTreeSet, HashSet};

use serde_json::{Map, Value};

use crate::{
    dependencies::{decode_reference_name, topological_sort_schemas},
    registry::lookup_registered_rust_type,
    routes::{
        build_route_schema_name, generate_route_module_name, generate_route_schema_names,
        parse_openapi_paths, RouteInfo,
    },
};

#[derive(Debug, Clone)]
pub struct GenerationOptions {
    pub include_routes: bool,
    pub extra_header_lines: Vec<String>,
    pub default_http_client_crate: String,
}

impl Default for GenerationOptions {
    fn default() -> Self {
        Self {
            include_routes: true,
            extra_header_lines: Vec::new(),
            default_http_client_crate: "http_client_rust_tokio".to_owned(),
        }
    }
}

pub fn convert_schema_to_rust_type(schema: &Value) -> String {
    let mut state = RenderState::default();
    render_type_expression("GeneratedType", schema, &mut state)
}

pub fn openapi_to_rust_code(openapi: &Value, options: &GenerationOptions) -> String {
    let mut state = RenderState::default();

    state.ensure_import("serde::{Deserialize, Serialize}");

    let schemas = openapi
        .get("components")
        .and_then(|components| components.get("schemas"))
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    for schema_name in topological_sort_schemas(&schemas) {
        if let Some(schema) = schemas.get(&schema_name) {
            state.emit_named_schema(&schema_name, schema);
        }
    }

    let mut route_aliases = Vec::new();
    let mut request_modules = Vec::new();
    let mut response_modules = Vec::new();

    if options.include_routes {
        let routes = parse_openapi_paths(openapi);
        if !routes.is_empty() {
            for route in &routes {
                let names = generate_route_schema_names(route);

                if let Some(schema_name) = names.params_schema_name {
                    maybe_emit_route_alias(
                        &mut state,
                        &mut route_aliases,
                        &schema_name,
                        &build_parameter_object_schema(route, "path"),
                    );
                }
                if let Some(schema_name) = names.query_schema_name {
                    maybe_emit_route_alias(
                        &mut state,
                        &mut route_aliases,
                        &schema_name,
                        &build_parameter_object_schema(route, "query"),
                    );
                }
                if let Some(schema_name) = names.headers_schema_name {
                    maybe_emit_route_alias(
                        &mut state,
                        &mut route_aliases,
                        &schema_name,
                        &build_parameter_object_schema(route, "header"),
                    );
                }
                if let Some(schema_name) = names.body_schema_name {
                    if let Some(body) = route.request_body.as_ref() {
                        maybe_emit_route_alias(&mut state, &mut route_aliases, &schema_name, body);
                    }
                }

                for (status, schema) in &route.responses {
                    let suffix = if status.starts_with('2') {
                        format!("{status}Response")
                    } else {
                        format!("{status}ErrorResponse")
                    };
                    let schema_name = build_route_schema_name(&route.path, &route.method, &suffix);
                    maybe_emit_route_alias(&mut state, &mut route_aliases, &schema_name, schema);
                }
            }

            request_modules = render_request_modules(&routes);
            response_modules = render_response_modules(&routes);
        }
    }

    let mut lines = Vec::new();
    lines.push("// This file was automatically generated from OpenAPI schema".to_owned());
    lines.push("// Do not manually edit this file".to_owned());
    lines.push(String::new());

    let imports = state.imports.iter().cloned().collect::<Vec<_>>();
    for import in imports {
        lines.push(format!("use {import};"));
    }
    if options.include_routes {
        lines.push(format!(
            "pub use {} as default_http_client;",
            options.default_http_client_crate
        ));
    }
    if !options.extra_header_lines.is_empty() {
        for line in &options.extra_header_lines {
            lines.push(line.clone());
        }
    }
    if !lines.last().is_some_and(|line| line.is_empty()) {
        lines.push(String::new());
    }

    lines.extend(render_embedded_openapi_document(openapi));
    lines.push(String::new());

    for item in state.items.values() {
        lines.extend(item.iter().cloned());
        lines.push(String::new());
    }

    let has_aliases = !route_aliases.is_empty();
    for alias in route_aliases {
        lines.push(alias);
    }
    if !request_modules.is_empty() || !response_modules.is_empty() {
        if has_aliases {
            lines.push(String::new());
        }
        lines.push("pub mod request {".to_owned());
        for module in request_modules {
            lines.extend(indent_lines(module));
        }
        lines.push("}".to_owned());
        lines.push(String::new());
        lines.push("pub mod response {".to_owned());
        for module in response_modules {
            lines.extend(indent_lines(module));
        }
        lines.push("}".to_owned());
        lines.push(String::new());
    }

    while matches!(lines.last(), Some(line) if line.is_empty()) {
        lines.pop();
    }

    lines.join("\n")
}

fn maybe_emit_route_alias(
    state: &mut RenderState,
    route_aliases: &mut Vec<String>,
    schema_name: &str,
    schema: &Value,
) {
    let canonical_name = state.ensure_named_schema(schema_name, schema);
    if canonical_name != schema_name {
        route_aliases.push(format!("pub type {schema_name} = {canonical_name};"));
    }
}

fn build_parameter_object_schema(route: &RouteInfo, location: &str) -> Value {
    let parameters = route
        .parameters
        .iter()
        .filter(|parameter| parameter.location == location)
        .collect::<Vec<_>>();

    let properties = parameters
        .iter()
        .map(|parameter| (parameter.name.clone(), parameter.schema.clone()))
        .collect::<Map<_, _>>();
    let required = parameters
        .iter()
        .filter(|parameter| parameter.required)
        .map(|parameter| Value::String(parameter.name.clone()))
        .collect::<Vec<_>>();

    let mut object = Map::new();
    object.insert("type".into(), Value::String("object".into()));
    object.insert("properties".into(), Value::Object(properties));
    if !required.is_empty() {
        object.insert("required".into(), Value::Array(required));
    }
    if location != "query" {
        object.insert("additionalProperties".into(), Value::Bool(false));
    }

    Value::Object(object)
}

fn render_request_modules(routes: &[RouteInfo]) -> Vec<Vec<String>> {
    let mut grouped_routes = BTreeMap::<String, Vec<&RouteInfo>>::new();
    for route in routes {
        grouped_routes
            .entry(route.path.clone())
            .or_default()
            .push(route);
    }

    grouped_routes
        .into_iter()
        .filter_map(|(path, routes)| {
            let methods = routes
                .into_iter()
                .map(render_request_method)
                .filter(|lines| !lines.is_empty())
                .collect::<Vec<_>>();
            render_route_module(&path, methods)
        })
        .collect()
}

fn render_request_method(route: &RouteInfo) -> Vec<String> {
    let names = generate_route_schema_names(route);
    let method_name = route.method.to_ascii_lowercase();

    let mut inner = Vec::new();
    if let Some(name) = names.params_schema_name {
        inner.push(format!("pub type Params = crate::{name};"));
    }
    if let Some(name) = names.query_schema_name {
        inner.push(format!("pub type Query = crate::{name};"));
    }
    if let Some(name) = names.headers_schema_name {
        inner.push(format!("pub type Headers = crate::{name};"));
    }
    if let Some(name) = names.body_schema_name {
        inner.push(format!("pub type Body = crate::{name};"));
    }

    if inner.is_empty() {
        return Vec::new();
    }

    let mut lines = Vec::new();
    lines.push(format!("pub mod {method_name} {{"));
    lines.extend(indent_lines(inner));
    lines.push("}".to_owned());
    lines
}

fn render_response_modules(routes: &[RouteInfo]) -> Vec<Vec<String>> {
    let mut grouped_routes = BTreeMap::<String, Vec<&RouteInfo>>::new();
    for route in routes {
        grouped_routes
            .entry(route.path.clone())
            .or_default()
            .push(route);
    }

    grouped_routes
        .into_iter()
        .filter_map(|(path, routes)| {
            let methods = routes
                .into_iter()
                .map(render_response_method)
                .filter(|lines| !lines.is_empty())
                .collect::<Vec<_>>();
            render_route_module(&path, methods)
        })
        .collect()
}

fn render_response_method(route: &RouteInfo) -> Vec<String> {
    let method_name = route.method.to_ascii_lowercase();

    let mut inner = Vec::new();
    for (status, _) in &route.responses {
        let suffix = if status.starts_with('2') {
            format!("{status}Response")
        } else {
            format!("{status}ErrorResponse")
        };
        let schema_name = build_route_schema_name(&route.path, &route.method, &suffix);
        inner.push(format!("pub type Status{status} = crate::{schema_name};"));
    }

    if inner.is_empty() {
        return Vec::new();
    }

    let mut lines = Vec::new();
    lines.push(format!("pub mod {method_name} {{"));
    lines.extend(indent_lines(inner));
    lines.push("}".to_owned());
    lines
}

fn render_route_module(path: &str, methods: Vec<Vec<String>>) -> Option<Vec<String>> {
    if methods.is_empty() {
        return None;
    }

    let module_name = generate_route_module_name(path);
    let mut lines = Vec::new();
    lines.push(format!("pub mod {module_name} {{"));
    for method in methods {
        lines.extend(indent_lines(method));
    }
    lines.push("}".to_owned());
    Some(lines)
}

#[derive(Debug, Default)]
struct RenderState {
    items: BTreeMap<String, Vec<String>>,
    fingerprints: BTreeMap<String, String>,
    imports: BTreeSet<String>,
    visiting: HashSet<String>,
}

impl RenderState {
    fn ensure_import(&mut self, import: &str) {
        self.imports.insert(import.to_owned());
    }

    fn ensure_named_schema(&mut self, name: &str, schema: &Value) -> String {
        let fingerprint = schema_fingerprint(schema);
        if let Some(existing_name) = self.fingerprints.get(&fingerprint) {
            return existing_name.clone();
        }
        let emitted_name = self.emit_named_schema(name, schema);
        self.fingerprints.insert(fingerprint, emitted_name.clone());
        emitted_name
    }

    fn emit_named_schema(&mut self, name: &str, schema: &Value) -> String {
        if self.items.contains_key(name) || self.visiting.contains(name) {
            return name.to_owned();
        }

        self.visiting.insert(name.to_owned());
        let item = render_named_item(name, schema, self);
        self.visiting.remove(name);
        self.items.insert(name.to_owned(), item);
        name.to_owned()
    }
}

fn render_named_item(name: &str, schema: &Value, state: &mut RenderState) -> Vec<String> {
    let base_schema = strip_nullable(schema);

    if let Some(lines) = render_nullable_union_item(name, base_schema, state) {
        return lines;
    }

    if is_string_enum(base_schema) {
        return render_string_enum(name, base_schema);
    }

    if is_union_schema(base_schema) {
        return render_union_enum(name, base_schema, state);
    }

    if is_intersection_schema(base_schema) {
        return render_intersection_struct(name, base_schema, state);
    }

    if is_object_schema(base_schema) {
        return render_object_item(name, base_schema, state);
    }

    let alias = render_type_expression(name, schema, state);
    vec![format!("pub type {name} = {alias};")]
}

fn render_string_enum(name: &str, schema: &Value) -> Vec<String> {
    let values = schema
        .get("enum")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>();

    let mut seen_variants = HashSet::new();
    let mut lines = vec![
        "#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]".to_owned(),
        format!("pub enum {name} {{"),
    ];

    for (index, value) in values.iter().enumerate() {
        let mut variant = sanitize_enum_variant(value);
        if !seen_variants.insert(variant.clone()) {
            variant = format!("{variant}{index}");
        }
        lines.push(format!("    #[serde(rename = \"{value}\")]"));
        lines.push(format!("    {variant},"));
    }
    lines.push("}".to_owned());
    lines
}

fn render_union_enum(name: &str, schema: &Value, state: &mut RenderState) -> Vec<String> {
    let mut lines = vec![
        "#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]".to_owned(),
        "#[serde(untagged)]".to_owned(),
        format!("pub enum {name} {{"),
    ];

    for (index, variant_schema) in union_variants(schema).iter().enumerate() {
        let variant_name = if let Some(reference_name) = variant_schema
            .get("$ref")
            .and_then(Value::as_str)
            .and_then(decode_reference_name)
        {
            reference_name
        } else {
            format!("{name}Variant{}", index + 1)
        };

        let variant_type =
            render_non_nullable_type_expression(&variant_name, variant_schema, state);

        lines.push(format!(
            "    {}({variant_type}),",
            sanitize_enum_variant(&variant_name)
        ));
    }
    lines.push("}".to_owned());
    lines
}

fn render_nullable_union_item(
    name: &str,
    schema: &Value,
    state: &mut RenderState,
) -> Option<Vec<String>> {
    let variants = union_variants(schema);
    if variants.is_empty() {
        return None;
    }

    let non_null_variants = variants
        .iter()
        .filter(|variant| !is_null_schema(variant))
        .cloned()
        .collect::<Vec<_>>();
    let null_variant_count = variants.len().saturating_sub(non_null_variants.len());

    if null_variant_count == 0 {
        return None;
    }

    if non_null_variants.is_empty() {
        return Some(vec![format!("pub type {name} = Option<()>;")]);
    }

    if non_null_variants.len() == 1 {
        let inner_type = render_type_expression(name, non_null_variants[0], state);
        return Some(vec![format!("pub type {name} = Option<{inner_type}>;")]);
    }

    let non_null_enum_name = format!("{name}Value");
    let mut lines = render_union_enum(
        &non_null_enum_name,
        &Value::Object(Map::from_iter([(
            "oneOf".to_owned(),
            Value::Array(non_null_variants.into_iter().cloned().collect()),
        )])),
        state,
    );
    lines.push(format!("pub type {name} = Option<{non_null_enum_name}>;"));
    Some(lines)
}

fn render_intersection_struct(name: &str, schema: &Value, state: &mut RenderState) -> Vec<String> {
    let parts = schema
        .get("allOf")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut lines = vec![
        "#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]".to_owned(),
        format!("pub struct {name} {{"),
    ];

    for (index, part_schema) in parts.iter().enumerate() {
        let part_name = if let Some(reference_name) = part_schema
            .get("$ref")
            .and_then(Value::as_str)
            .and_then(decode_reference_name)
        {
            reference_name
        } else {
            format!("{name}Part{}", index + 1)
        };
        let part_type = if part_schema.get("$ref").is_some() {
            render_non_nullable_type_expression(&part_name, part_schema, state)
        } else {
            state.ensure_named_schema(&part_name, part_schema)
        };
        lines.push("    #[serde(flatten)]".to_owned());
        lines.push(format!(
            "    pub {}: {part_type},",
            sanitize_field_name(&part_name)
        ));
    }

    lines.push("}".to_owned());
    lines
}

fn render_object_item(name: &str, schema: &Value, state: &mut RenderState) -> Vec<String> {
    let properties = schema
        .get("properties")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let required = schema
        .get("required")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect::<HashSet<_>>();
    let additional_properties = schema.get("additionalProperties");

    if properties.is_empty() {
        match additional_properties {
            Some(Value::Bool(false)) => {
                return vec![
                    "#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]"
                        .to_owned(),
                    "#[serde(deny_unknown_fields)]".to_owned(),
                    format!("pub struct {name};"),
                ];
            }
            Some(Value::Object(schema)) => {
                state.ensure_import("std::collections::BTreeMap");
                let value_type = render_non_nullable_type_expression(
                    &format!("{name}Value"),
                    &Value::Object(schema.clone()),
                    state,
                );
                return vec![format!("pub type {name} = BTreeMap<String, {value_type}>;")];
            }
            _ => {
                state.ensure_import("std::collections::BTreeMap");
                state.ensure_import("serde_json::Value");
                return vec![format!("pub type {name} = BTreeMap<String, Value>;")];
            }
        }
    }

    let mut lines = vec!["#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]".to_owned()];
    if matches!(additional_properties, Some(Value::Bool(false))) {
        lines.push("#[serde(deny_unknown_fields)]".to_owned());
    }
    lines.push(format!("pub struct {name} {{"));

    for (property_name, property_schema) in properties {
        let field_name = sanitize_field_name(&property_name);
        let rename_needed = field_name != property_name;
        let field_type = render_field_type(
            name,
            &property_name,
            &property_schema,
            required.contains(property_name.as_str()),
            state,
        );

        if rename_needed {
            lines.push(format!("    #[serde(rename = \"{property_name}\")]"));
        }
        if field_type.starts_with("Option<") {
            lines.push(
                "    #[serde(default, skip_serializing_if = \"Option::is_none\")]".to_owned(),
            );
        }
        lines.push(format!("    pub {field_name}: {field_type},"));
    }

    if !matches!(additional_properties, Some(Value::Bool(false)) | None) {
        state.ensure_import("std::collections::BTreeMap");
        let extra_type = match additional_properties {
            Some(Value::Object(extra_schema)) => render_non_nullable_type_expression(
                &format!("{name}AdditionalProperty"),
                &Value::Object(extra_schema.clone()),
                state,
            ),
            _ => {
                state.ensure_import("serde_json::Value");
                "Value".to_owned()
            }
        };
        lines.push("    #[serde(flatten)]".to_owned());
        lines.push(format!(
            "    pub additional_properties: BTreeMap<String, {extra_type}>,"
        ));
    }

    lines.push("}".to_owned());
    lines
}

fn render_field_type(
    parent_name: &str,
    property_name: &str,
    schema: &Value,
    required: bool,
    state: &mut RenderState,
) -> String {
    let type_name = format!("{parent_name}{}", to_pascal_case(property_name));
    let inner_type = render_non_nullable_type_expression(&type_name, schema, state);
    let nullable = schema
        .get("nullable")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !required || nullable {
        format!("Option<{inner_type}>")
    } else {
        inner_type
    }
}

fn render_type_expression(name_hint: &str, schema: &Value, state: &mut RenderState) -> String {
    if let Some(nullable_union_type) =
        render_nullable_union_type_expression(name_hint, schema, state)
    {
        return nullable_union_type;
    }

    let inner = render_non_nullable_type_expression(name_hint, schema, state);
    if schema
        .get("nullable")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        format!("Option<{inner}>")
    } else {
        inner
    }
}

fn render_non_nullable_type_expression(
    name_hint: &str,
    schema: &Value,
    state: &mut RenderState,
) -> String {
    let schema = strip_nullable(schema);

    if let Some(nullable_union_type) =
        render_nullable_union_type_expression(name_hint, schema, state)
    {
        return nullable_union_type;
    }

    if let Some(reference_name) = schema
        .get("$ref")
        .and_then(Value::as_str)
        .and_then(decode_reference_name)
    {
        return reference_name;
    }

    if let Some(registered_type) = lookup_registered_rust_type(schema) {
        record_type_imports(&registered_type, state);
        return registered_type;
    }

    if is_string_enum(schema) || is_union_schema(schema) || is_intersection_schema(schema) {
        return state.ensure_named_schema(name_hint, schema);
    }

    if is_object_schema(schema) {
        let properties = schema
            .get("properties")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let additional_properties = schema.get("additionalProperties");
        if properties.is_empty() {
            match additional_properties {
                Some(Value::Bool(false)) => return state.ensure_named_schema(name_hint, schema),
                Some(Value::Object(extra_schema)) => {
                    state.ensure_import("std::collections::BTreeMap");
                    let extra_type = render_non_nullable_type_expression(
                        &format!("{name_hint}Value"),
                        &Value::Object(extra_schema.clone()),
                        state,
                    );
                    return format!("BTreeMap<String, {extra_type}>");
                }
                _ => {
                    state.ensure_import("std::collections::BTreeMap");
                    state.ensure_import("serde_json::Value");
                    return "BTreeMap<String, Value>".to_owned();
                }
            }
        }
        return state.ensure_named_schema(name_hint, schema);
    }

    if let Some(items) = schema.get("items") {
        let item_type =
            render_non_nullable_type_expression(&format!("{name_hint}Item"), items, state);
        return format!("Vec<{item_type}>");
    }

    match schema.get("type").and_then(Value::as_str) {
        Some("string") => render_string_type(schema, state),
        Some("integer") => "i64".to_owned(),
        Some("number") => "f64".to_owned(),
        Some("boolean") => "bool".to_owned(),
        Some("null") => "()".to_owned(),
        _ => {
            state.ensure_import("serde_json::Value");
            "Value".to_owned()
        }
    }
}

fn render_nullable_union_type_expression(
    name_hint: &str,
    schema: &Value,
    state: &mut RenderState,
) -> Option<String> {
    let variants = union_variants(schema);
    if variants.is_empty() {
        return None;
    }

    let non_null_variants = variants
        .iter()
        .filter(|variant| !is_null_schema(variant))
        .cloned()
        .collect::<Vec<_>>();
    let null_variant_count = variants.len().saturating_sub(non_null_variants.len());

    if null_variant_count == 0 {
        return None;
    }

    if non_null_variants.is_empty() {
        return Some("Option<()>".to_owned());
    }

    if non_null_variants.len() == 1 {
        let inner = render_type_expression(name_hint, non_null_variants[0], state);
        return Some(format!("Option<{inner}>"));
    }

    let non_null_enum_name = format!("{name_hint}Value");
    let non_null_union = Value::Object(Map::from_iter([(
        "oneOf".to_owned(),
        Value::Array(non_null_variants.into_iter().cloned().collect()),
    )]));
    let inner = state.ensure_named_schema(&non_null_enum_name, &non_null_union);
    Some(format!("Option<{inner}>"))
}

fn render_string_type(schema: &Value, state: &mut RenderState) -> String {
    match schema.get("format").and_then(Value::as_str) {
        Some("date") | Some("iso-date") => {
            state.ensure_import("chrono::NaiveDate");
            "NaiveDate".to_owned()
        }
        Some("date-time") | Some("iso-date-time") => {
            state.ensure_import("chrono::{DateTime, Utc}");
            "DateTime<Utc>".to_owned()
        }
        Some("uri") | Some("url") => {
            state.ensure_import("url::Url");
            "Url".to_owned()
        }
        Some("uuid") => {
            state.ensure_import("uuid::Uuid");
            "Uuid".to_owned()
        }
        _ => "String".to_owned(),
    }
}

fn strip_nullable(schema: &Value) -> &Value {
    schema
}

fn union_variants(schema: &Value) -> Vec<&Value> {
    schema
        .get("oneOf")
        .or_else(|| schema.get("anyOf"))
        .and_then(Value::as_array)
        .map(|variants| variants.iter().collect())
        .unwrap_or_default()
}

fn is_object_schema(schema: &Value) -> bool {
    schema
        .get("type")
        .and_then(Value::as_str)
        .map(|value| value == "object")
        .unwrap_or_else(|| schema.get("properties").is_some())
}

fn is_union_schema(schema: &Value) -> bool {
    !union_variants(schema).is_empty()
}

fn is_null_schema(schema: &Value) -> bool {
    schema.get("type").and_then(Value::as_str) == Some("null")
}

fn is_intersection_schema(schema: &Value) -> bool {
    schema.get("allOf").is_some()
}

fn is_string_enum(schema: &Value) -> bool {
    schema.get("type").and_then(Value::as_str) == Some("string")
        && schema
            .get("enum")
            .and_then(Value::as_array)
            .map(|values| values.iter().all(|value| value.is_string()))
            .unwrap_or(false)
}

fn schema_fingerprint(schema: &Value) -> String {
    canonical_json(schema)
}

fn canonical_json(value: &Value) -> String {
    match value {
        Value::Null => "null".to_owned(),
        Value::Bool(boolean) => boolean.to_string(),
        Value::Number(number) => number.to_string(),
        Value::String(string) => format!("{string:?}"),
        Value::Array(items) => {
            let inner = items
                .iter()
                .map(canonical_json)
                .collect::<Vec<_>>()
                .join(",");
            format!("[{inner}]")
        }
        Value::Object(object) => {
            let mut parts = object
                .iter()
                .map(|(key, value)| format!("{key:?}:{}", canonical_json(value)))
                .collect::<Vec<_>>();
            parts.sort();
            format!("{{{}}}", parts.join(","))
        }
    }
}

fn render_embedded_openapi_document(openapi: &Value) -> Vec<String> {
    let serialized = serde_json::to_string_pretty(openapi)
        .expect("OpenAPI document should serialize to JSON for embedding");
    let literal = to_raw_string_literal(&serialized);

    vec![
        format!("pub const OPENAPI_JSON: &str = {literal};"),
        String::new(),
        "pub fn openapi_document() -> serde_json::Value {".to_owned(),
        "    serde_json::from_str(OPENAPI_JSON)".to_owned(),
        "        .expect(\"embedded OPENAPI_JSON should be valid JSON\")".to_owned(),
        "}".to_owned(),
    ]
}

fn to_raw_string_literal(value: &str) -> String {
    for hash_count in 0..=16 {
        let hashes = "#".repeat(hash_count);
        let closing_delimiter = format!("\"{hashes}");
        if !value.contains(&closing_delimiter) {
            return format!("r{hashes}\"{value}\"{hashes}");
        }
    }

    format!("{value:?}")
}

fn indent_lines(lines: Vec<String>) -> Vec<String> {
    lines
        .into_iter()
        .map(|line| {
            if line.is_empty() {
                line
            } else {
                format!("    {line}")
            }
        })
        .collect()
}

fn record_type_imports(type_name: &str, state: &mut RenderState) {
    if type_name.contains("NaiveDate") {
        state.ensure_import("chrono::NaiveDate");
    }
    if type_name.contains("DateTime<Utc>") {
        state.ensure_import("chrono::{DateTime, Utc}");
    }
    if type_name.contains("Uuid") {
        state.ensure_import("uuid::Uuid");
    }
    if type_name.contains("Url") {
        state.ensure_import("url::Url");
    }
    if type_name.contains("BTreeMap") {
        state.ensure_import("std::collections::BTreeMap");
    }
    if type_name.contains("Value") {
        state.ensure_import("serde_json::Value");
    }
}

fn sanitize_enum_variant(value: &str) -> String {
    let candidate = to_pascal_case(value);
    if candidate.is_empty() {
        "Unknown".to_owned()
    } else if candidate
        .chars()
        .next()
        .is_some_and(|character| character.is_ascii_digit())
    {
        format!("Value{candidate}")
    } else {
        candidate
    }
}

fn sanitize_field_name(value: &str) -> String {
    let candidate = to_snake_case(value);
    if candidate.is_empty() {
        "field".to_owned()
    } else if candidate
        .chars()
        .next()
        .is_some_and(|character| character.is_ascii_digit())
    {
        format!("field_{candidate}")
    } else if is_rust_keyword(&candidate) {
        format!("r#{candidate}")
    } else {
        candidate
    }
}

fn is_rust_keyword(value: &str) -> bool {
    matches!(
        value,
        "as" | "break"
            | "const"
            | "continue"
            | "crate"
            | "else"
            | "enum"
            | "extern"
            | "false"
            | "fn"
            | "for"
            | "if"
            | "impl"
            | "in"
            | "let"
            | "loop"
            | "match"
            | "mod"
            | "move"
            | "mut"
            | "pub"
            | "ref"
            | "return"
            | "self"
            | "Self"
            | "static"
            | "struct"
            | "super"
            | "trait"
            | "true"
            | "type"
            | "unsafe"
            | "use"
            | "where"
            | "while"
            | "async"
            | "await"
            | "dyn"
    )
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

use std::collections::{BTreeSet, HashMap, HashSet};

use serde_json::{Map, Value};

pub fn extract_schema_dependencies(schema: &Value) -> Vec<String> {
    let mut seen = BTreeSet::new();
    collect_dependencies(schema, &mut seen);
    seen.into_iter().collect()
}

fn collect_dependencies(schema: &Value, dependencies: &mut BTreeSet<String>) {
    match schema {
        Value::Array(items) => {
            for item in items {
                collect_dependencies(item, dependencies);
            }
        }
        Value::Object(object) => {
            if let Some(reference) = object.get("$ref").and_then(Value::as_str) {
                if let Some(name) = decode_reference_name(reference) {
                    dependencies.insert(name);
                }
            }

            for value in object.values() {
                collect_dependencies(value, dependencies);
            }
        }
        _ => {}
    }
}

pub fn topological_sort_schemas(schemas: &Map<String, Value>) -> Vec<String> {
    let mut ordered = Vec::new();
    let mut visited = HashSet::new();
    let mut visiting = HashSet::new();

    let mut schema_names = schemas.keys().cloned().collect::<Vec<_>>();
    schema_names.sort();

    let dependency_map = schemas
        .iter()
        .map(|(name, schema)| {
            (
                name.clone(),
                extract_schema_dependencies(schema)
                    .into_iter()
                    .filter(|dependency| dependency != name)
                    .collect::<Vec<_>>(),
            )
        })
        .collect::<HashMap<_, _>>();

    for name in schema_names {
        visit_schema(
            &name,
            schemas,
            &dependency_map,
            &mut visited,
            &mut visiting,
            &mut ordered,
        );
    }

    ordered
}

fn visit_schema(
    name: &str,
    schemas: &Map<String, Value>,
    dependency_map: &HashMap<String, Vec<String>>,
    visited: &mut HashSet<String>,
    visiting: &mut HashSet<String>,
    ordered: &mut Vec<String>,
) {
    if visited.contains(name) || visiting.contains(name) {
        return;
    }
    if !schemas.contains_key(name) {
        return;
    }

    visiting.insert(name.to_owned());
    if let Some(dependencies) = dependency_map.get(name) {
        let mut sorted_dependencies = dependencies.clone();
        sorted_dependencies.sort();
        for dependency in sorted_dependencies {
            visit_schema(
                &dependency,
                schemas,
                dependency_map,
                visited,
                visiting,
                ordered,
            );
        }
    }
    visiting.remove(name);
    visited.insert(name.to_owned());
    ordered.push(name.to_owned());
}

pub(crate) fn decode_reference_name(reference: &str) -> Option<String> {
    let name = reference.strip_prefix("#/components/schemas/")?;
    urlencoding::decode(name)
        .ok()
        .map(|value| value.into_owned())
}

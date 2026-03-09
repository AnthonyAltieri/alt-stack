from __future__ import annotations

from typing import Any
from urllib.parse import unquote

from .types import AnySchema


def extract_schema_dependencies(schema: AnySchema | None) -> list[str]:
    dependencies: set[str] = set()
    visited: set[int] = set()

    def traverse(obj: Any) -> None:
        if obj is None or not isinstance(obj, (dict, list)):
            return

        obj_id = id(obj)
        if obj_id in visited:
            return
        visited.add(obj_id)

        if isinstance(obj, dict) and isinstance(obj.get("$ref"), str):
            match = obj["$ref"].split("#/components/schemas/")
            if len(match) == 2 and match[1]:
                dependencies.add(unquote(match[1]))
            return

        if isinstance(obj, list):
            for item in obj:
                traverse(item)
            return

        if isinstance(obj, dict):
            props = obj.get("properties")
            if isinstance(props, dict):
                for value in props.values():
                    traverse(value)

            for key in [
                "items",
                "oneOf",
                "allOf",
                "anyOf",
                "not",
                "if",
                "then",
                "else",
                "prefixItems",
                "contains",
                "propertyNames",
                "dependentSchemas",
            ]:
                if key in obj:
                    traverse(obj[key])

            additional = obj.get("additionalProperties")
            if isinstance(additional, dict):
                traverse(additional)

            discriminator = obj.get("discriminator")
            if isinstance(discriminator, dict):
                mapping = discriminator.get("mapping")
                if isinstance(mapping, dict):
                    for value in mapping.values():
                        traverse(value)

    traverse(schema)
    return list(dependencies)


def topological_sort_schemas(schemas: dict[str, AnySchema]) -> list[str]:
    schema_names = list(schemas.keys())
    dependencies: dict[str, list[str]] = {name: [] for name in schema_names}
    dependents: dict[str, list[str]] = {name: [] for name in schema_names}
    in_degree: dict[str, int] = {name: 0 for name in schema_names}

    for name, schema in schemas.items():
        deps = extract_schema_dependencies(schema)
        valid_deps = [dep for dep in deps if dep in schemas]
        dependencies[name] = valid_deps
        for dep in valid_deps:
            dependents[dep].append(name)

    for name, deps in dependencies.items():
        in_degree[name] = len(deps)

    queue = [name for name, degree in in_degree.items() if degree == 0]
    sorted_names: list[str] = []

    while queue:
        current = queue.pop(0)
        sorted_names.append(current)
        for dependent in dependents[current]:
            in_degree[dependent] -= 1
            if in_degree[dependent] == 0:
                queue.append(dependent)

    if len(sorted_names) != len(schema_names):
        for name in schema_names:
            if name not in sorted_names:
                sorted_names.append(name)

    return sorted_names

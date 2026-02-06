from __future__ import annotations

from python_zod_openapi.dependencies import extract_schema_dependencies, topological_sort_schemas


def test_extract_single_ref() -> None:
    schema = {"$ref": "#/components/schemas/User"}
    assert extract_schema_dependencies(schema) == ["User"]


def test_extract_multiple_refs() -> None:
    schema = {
        "type": "object",
        "properties": {
            "user": {"$ref": "#/components/schemas/User"},
            "profile": {"$ref": "#/components/schemas/Profile"},
        },
    }
    assert sorted(extract_schema_dependencies(schema)) == ["Profile", "User"]


def test_extract_ref_with_encoding() -> None:
    schema = {"$ref": "#/components/schemas/User%20Profile"}
    assert extract_schema_dependencies(schema) == ["User Profile"]


def test_extract_nested_refs() -> None:
    schema = {
        "type": "object",
        "properties": {
            "user": {
                "type": "object",
                "properties": {"p": {"$ref": "#/components/schemas/Profile"}},
            }
        },
    }
    assert extract_schema_dependencies(schema) == ["Profile"]


def test_extract_array_refs() -> None:
    schema = {"type": "array", "items": {"$ref": "#/components/schemas/User"}}
    assert extract_schema_dependencies(schema) == ["User"]


def test_extract_union_refs() -> None:
    schema = {
        "oneOf": [
            {"$ref": "#/components/schemas/User"},
            {"$ref": "#/components/schemas/Admin"},
        ]
    }
    assert sorted(extract_schema_dependencies(schema)) == ["Admin", "User"]


def test_extract_allof_refs() -> None:
    schema = {
        "allOf": [
            {"$ref": "#/components/schemas/Base"},
            {"$ref": "#/components/schemas/Extended"},
        ]
    }
    assert sorted(extract_schema_dependencies(schema)) == ["Base", "Extended"]


def test_extract_invalid_ref() -> None:
    schema = {"$ref": "invalid-ref"}
    assert extract_schema_dependencies(schema) == []


def test_extract_null_schema() -> None:
    assert extract_schema_dependencies(None) == []


def test_extract_schema_without_ref() -> None:
    assert extract_schema_dependencies({"type": "string"}) == []


def test_topological_sort_simple() -> None:
    schemas = {
        "User": {
            "type": "object",
            "properties": {"profile": {"$ref": "#/components/schemas/Profile"}},
        },
        "Profile": {"type": "object", "properties": {"name": {"type": "string"}}},
    }
    result = topological_sort_schemas(schemas)
    assert result.index("Profile") < result.index("User")


def test_topological_sort_multiple_deps() -> None:
    schemas = {
        "User": {
            "type": "object",
            "properties": {
                "profile": {"$ref": "#/components/schemas/Profile"},
                "settings": {"$ref": "#/components/schemas/Settings"},
            },
        },
        "Profile": {"type": "object", "properties": {"name": {"type": "string"}}},
        "Settings": {"type": "object", "properties": {"theme": {"type": "string"}}},
    }
    result = topological_sort_schemas(schemas)
    assert result.index("Profile") < result.index("User")
    assert result.index("Settings") < result.index("User")


def test_topological_sort_circular() -> None:
    schemas = {
        "A": {"type": "object", "properties": {"b": {"$ref": "#/components/schemas/B"}}},
        "B": {"type": "object", "properties": {"a": {"$ref": "#/components/schemas/A"}}},
    }
    result = topological_sort_schemas(schemas)
    assert set(result) == {"A", "B"}

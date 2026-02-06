from __future__ import annotations

from python_zod_openapi.interface_generator import generate_interface, schema_to_type_string
from python_zod_openapi.registry import (
    clear_pydantic_schema_registry,
    register_pydantic_type_to_openapi_schema,
)


def setup_function() -> None:
    clear_pydantic_schema_registry()


def test_schema_to_type_primitives() -> None:
    assert schema_to_type_string({"type": "string"}) == "str"
    assert schema_to_type_string({"type": "number"}) == "float"
    assert schema_to_type_string({"type": "integer"}) == "int"
    assert schema_to_type_string({"type": "boolean"}) == "bool"
    assert schema_to_type_string({"type": "null"}) == "None"


def test_schema_to_type_enum() -> None:
    result = schema_to_type_string({"type": "string", "enum": ["A", "B"]})
    assert result == "Literal['A', 'B']"


def test_schema_to_type_array() -> None:
    result = schema_to_type_string({"type": "array", "items": {"type": "string"}})
    assert result == "list[str]"


def test_schema_to_type_object() -> None:
    schema = {
        "type": "object",
        "properties": {"id": {"type": "string"}, "name": {"type": "string"}},
        "required": ["id"],
    }
    result = schema_to_type_string(schema)
    assert result == "{ id: str; name?: str }"


def test_generate_interface_object() -> None:
    schema = {
        "type": "object",
        "properties": {"id": {"type": "string"}, "name": {"type": "string"}},
        "required": ["id"],
    }
    result = generate_interface("User", schema)
    expected = "\n".join(
        [
            "class User(TypedDict):",
            "    id: str",
            "    name: NotRequired[str]",
        ]
    )
    assert result == expected


def test_registered_format_uses_output_alias() -> None:
    schema = object()
    register_pydantic_type_to_openapi_schema(
        schema,
        {
            "schema_exported_variable_name": "uuid_schema",
            "type": "string",
            "format": "uuid",
            "description": None,
        },
    )
    result = schema_to_type_string({"type": "string", "format": "uuid"})
    assert result == "UuidSchemaOutput"

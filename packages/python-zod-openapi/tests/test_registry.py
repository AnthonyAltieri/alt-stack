from __future__ import annotations

import pytest

from python_zod_openapi.registry import (
    clear_pydantic_schema_registry,
    get_schema_exported_variable_name_for_string_format,
    register_pydantic_type_to_openapi_schema,
    schema_registry,
)


def setup_function() -> None:
    clear_pydantic_schema_registry()


def test_register_single_format() -> None:
    schema = object()
    register_pydantic_type_to_openapi_schema(
        schema,
        {
            "schema_exported_variable_name": "email_schema",
            "type": "string",
            "format": "email",
            "description": None,
        },
    )
    assert get_schema_exported_variable_name_for_string_format("email") == "email_schema"


def test_register_multiple_formats() -> None:
    schema = object()
    register_pydantic_type_to_openapi_schema(
        schema,
        {
            "schema_exported_variable_name": "date_schema",
            "type": "string",
            "formats": ["date", "iso-date"],
            "description": None,
        },
    )
    assert get_schema_exported_variable_name_for_string_format("date") == "date_schema"
    assert get_schema_exported_variable_name_for_string_format("iso-date") == "date_schema"


def test_duplicate_format_raises() -> None:
    schema1 = object()
    schema2 = object()
    register_pydantic_type_to_openapi_schema(
        schema1,
        {
            "schema_exported_variable_name": "email_schema_1",
            "type": "string",
            "format": "email",
            "description": None,
        },
    )
    with pytest.raises(ValueError, match="duplicate Pydantic OpenAPI registration"):
        register_pydantic_type_to_openapi_schema(
            schema2,
            {
                "schema_exported_variable_name": "email_schema_2",
                "type": "string",
                "format": "email",
                "description": None,
            },
        )


def test_register_same_schema_twice() -> None:
    schema = object()
    register_pydantic_type_to_openapi_schema(
        schema,
        {
            "schema_exported_variable_name": "email_schema",
            "type": "string",
            "format": "email",
            "description": None,
        },
    )
    register_pydantic_type_to_openapi_schema(
        schema,
        {
            "schema_exported_variable_name": "email_schema",
            "type": "string",
            "format": "email",
            "description": None,
        },
    )


def test_register_primitive_types() -> None:
    number_schema = object()
    register_pydantic_type_to_openapi_schema(
        number_schema,
        {
            "schema_exported_variable_name": "number_schema",
            "type": "number",
            "description": None,
        },
    )
    assert schema_registry.is_registered(number_schema)

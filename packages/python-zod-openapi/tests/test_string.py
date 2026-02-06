from __future__ import annotations

from python_zod_openapi.registry import (
    clear_pydantic_schema_registry,
    register_pydantic_type_to_openapi_schema,
)
from python_zod_openapi.types.string import convert_openapi_string_to_pydantic


def setup_function() -> None:
    clear_pydantic_schema_registry()


def test_basic_string() -> None:
    assert (
        convert_openapi_string_to_pydantic({"type": "string"})
        == "Annotated[str, Field(strict=True)]"
    )


def test_enum_string() -> None:
    result = convert_openapi_string_to_pydantic({"type": "string", "enum": ["red", "green"]})
    assert result == "Literal['red', 'green']"


def test_format_email() -> None:
    result = convert_openapi_string_to_pydantic({"type": "string", "format": "email"})
    assert (
        result == "Annotated[EmailStr, Field(json_schema_extra={'openapi': {'format': 'email'}})]"
    )


def test_format_url() -> None:
    result = convert_openapi_string_to_pydantic({"type": "string", "format": "url"})
    assert result == "Annotated[AnyUrl, Field(json_schema_extra={'openapi': {'format': 'url'}})]"


def test_format_uri() -> None:
    result = convert_openapi_string_to_pydantic({"type": "string", "format": "uri"})
    assert result == "Annotated[AnyUrl, Field(json_schema_extra={'openapi': {'format': 'uri'}})]"


def test_format_uuid() -> None:
    result = convert_openapi_string_to_pydantic({"type": "string", "format": "uuid"})
    assert result == "Annotated[UUID, Field(json_schema_extra={'openapi': {'format': 'uuid'}})]"


def test_format_color_hex() -> None:
    result = convert_openapi_string_to_pydantic({"type": "string", "format": "color-hex"})
    expected = (
        "Annotated[str, Field(strict=True, pattern='^[a-fA-F0-9]{6}$', "
        "json_schema_extra={'openapi': {'format': 'color-hex'}})]"
    )
    assert result == expected


def test_format_unknown() -> None:
    result = convert_openapi_string_to_pydantic({"type": "string", "format": "unsupported"})
    assert (
        result == "Annotated[str, Field(strict=True, "
        "json_schema_extra={'openapi': {'format': 'unsupported'}})]"
    )


def test_min_length() -> None:
    result = convert_openapi_string_to_pydantic({"type": "string", "minLength": 5})
    assert (
        result == "Annotated[str, Field(strict=True, min_length=5, "
        "json_schema_extra={'openapi': {'minLength': 5}})]"
    )


def test_max_length() -> None:
    result = convert_openapi_string_to_pydantic({"type": "string", "maxLength": 10})
    assert (
        result == "Annotated[str, Field(strict=True, max_length=10, "
        "json_schema_extra={'openapi': {'maxLength': 10}})]"
    )


def test_min_max_length() -> None:
    result = convert_openapi_string_to_pydantic({"type": "string", "minLength": 5, "maxLength": 10})
    expected = (
        "Annotated[str, Field(strict=True, min_length=5, max_length=10, "
        "json_schema_extra={'openapi': {'maxLength': 10, 'minLength': 5}})]"
    )
    assert result == expected


def test_pattern() -> None:
    result = convert_openapi_string_to_pydantic({"type": "string", "pattern": "^[A-Z]+$"})
    expected = (
        "Annotated[str, Field(strict=True, pattern='^[A-Z]+$', "
        "json_schema_extra={'openapi': {'pattern': '^[A-Z]+$'}})]"
    )
    assert result == expected


def test_format_with_constraints() -> None:
    result = convert_openapi_string_to_pydantic(
        {"type": "string", "format": "email", "minLength": 5, "maxLength": 100}
    )
    expected = (
        "Annotated[EmailStr, Field(min_length=5, max_length=100, "
        "json_schema_extra={'openapi': {'format': 'email', "
        "'maxLength': 100, 'minLength': 5}})]"
    )
    assert result == expected


def test_custom_registry_overrides() -> None:
    schema = object()
    register_pydantic_type_to_openapi_schema(
        schema,
        {
            "schema_exported_variable_name": "custom_email",
            "type": "string",
            "format": "email",
            "description": None,
        },
    )
    result = convert_openapi_string_to_pydantic({"type": "string", "format": "email"})
    assert result == "custom_email"

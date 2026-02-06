from __future__ import annotations

import pytest

from python_zod_openapi.registry import clear_pydantic_schema_registry
from python_zod_openapi.to_python import convert_schema_to_pydantic_string


def setup_function() -> None:
    clear_pydantic_schema_registry()


def test_basic_types() -> None:
    assert (
        convert_schema_to_pydantic_string({"type": "string"})
        == "Annotated[str, Field(strict=True)]"
    )
    assert (
        convert_schema_to_pydantic_string({"type": "number"})
        == "Annotated[float, Field(strict=True)]"
    )
    assert (
        convert_schema_to_pydantic_string({"type": "integer"})
        == "Annotated[int, Field(strict=True)]"
    )
    assert (
        convert_schema_to_pydantic_string({"type": "boolean"})
        == "Annotated[bool, Field(strict=True)]"
    )


def test_array_and_object() -> None:
    assert (
        convert_schema_to_pydantic_string({"type": "array", "items": {"type": "string"}})
        == "list[Annotated[str, Field(strict=True)]]"
    )
    assert (
        convert_schema_to_pydantic_string(
            {
                "type": "object",
                "properties": {"name": {"type": "string"}},
                "required": ["name"],
            }
        )
        == "dict[str, Any]"
    )


def test_union() -> None:
    assert (
        convert_schema_to_pydantic_string({"oneOf": [{"type": "string"}, {"type": "number"}]})
        == "Union[Annotated[str, Field(strict=True)], Annotated[float, Field(strict=True)]]"
    )


def test_ref_handling() -> None:
    assert convert_schema_to_pydantic_string({"$ref": "#/components/schemas/User"}) == "User"
    assert (
        convert_schema_to_pydantic_string({"$ref": "#/components/schemas/User", "nullable": True})
        == "Optional[User]"
    )


def test_nullable_handling() -> None:
    assert (
        convert_schema_to_pydantic_string({"type": "string", "nullable": True})
        == "Optional[Annotated[str, Field(strict=True)]]"
    )


def test_invalid_ref() -> None:
    assert convert_schema_to_pydantic_string({"$ref": "invalid-ref"}) == "Any"


def test_null_schema() -> None:
    assert convert_schema_to_pydantic_string(None) == "Any"


def test_enum_string() -> None:
    assert (
        convert_schema_to_pydantic_string({"type": "string", "enum": ["A", "B"]})
        == "Literal['A', 'B']"
    )


def test_enum_number() -> None:
    assert convert_schema_to_pydantic_string({"type": "number", "enum": [1, 2]}) == "Literal[1, 2]"


def test_array_constraints() -> None:
    assert (
        convert_schema_to_pydantic_string(
            {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 2}
        )
        == "Annotated[list[Annotated[str, Field(strict=True)]], "
        "Field(min_length=1, max_length=2, "
        "json_schema_extra={'openapi': {'maxItems': 2, 'minItems': 1}})]"
    )


def test_number_constraints() -> None:
    assert (
        convert_schema_to_pydantic_string({"type": "integer", "minimum": 1, "maximum": 5})
        == "Annotated[int, Field(strict=True, ge=1, le=5, "
        "json_schema_extra={'openapi': {'maximum': 5, 'minimum': 1}})]"
    )


def test_string_constraints() -> None:
    assert (
        convert_schema_to_pydantic_string({"type": "string", "minLength": 2, "maxLength": 5})
        == "Annotated[str, Field(strict=True, min_length=2, max_length=5, "
        "json_schema_extra={'openapi': {'maxLength': 5, 'minLength': 2}})]"
    )
    assert (
        convert_schema_to_pydantic_string({"type": "string", "pattern": "^test$"})
        == "Annotated[str, Field(strict=True, pattern='^test$', "
        "json_schema_extra={'openapi': {'pattern': '^test$'}})]"
    )


@pytest.mark.parametrize(
    ("schema", "expected"),
    [
        (
            {"type": "string", "format": "email"},
            "Annotated[EmailStr, Field(json_schema_extra={'openapi': {'format': 'email'}})]",
        ),
        (
            {"type": "string", "format": "uuid"},
            "Annotated[UUID, Field(json_schema_extra={'openapi': {'format': 'uuid'}})]",
        ),
        (
            {"type": "string", "format": "url"},
            "Annotated[AnyUrl, Field(json_schema_extra={'openapi': {'format': 'url'}})]",
        ),
        (
            {"type": "string", "format": "uri"},
            "Annotated[AnyUrl, Field(json_schema_extra={'openapi': {'format': 'uri'}})]",
        ),
        (
            {"type": "string", "format": "date"},
            "Annotated[str, Field(strict=True, json_schema_extra={'openapi': {'format': 'date'}})]",
        ),
        (
            {"type": "string", "format": "date-time"},
            "Annotated[str, Field(strict=True, "
            "json_schema_extra={'openapi': {'format': 'date-time'}})]",
        ),
    ],
)
def test_string_formats(schema: dict, expected: str) -> None:
    assert convert_schema_to_pydantic_string(schema) == expected

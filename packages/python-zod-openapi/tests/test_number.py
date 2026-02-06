from __future__ import annotations

from python_zod_openapi.types.number import convert_openapi_number_to_pydantic


def test_basic_number() -> None:
    assert (
        convert_openapi_number_to_pydantic({"type": "number"})
        == "Annotated[float, Field(strict=True)]"
    )


def test_basic_integer() -> None:
    assert (
        convert_openapi_number_to_pydantic({"type": "integer"})
        == "Annotated[int, Field(strict=True)]"
    )


def test_number_enum() -> None:
    result = convert_openapi_number_to_pydantic({"type": "number", "enum": [1, 2]})
    assert result == "Literal[1, 2]"


def test_integer_enum() -> None:
    result = convert_openapi_number_to_pydantic({"type": "integer", "enum": [100, 200]})
    assert result == "Literal[100, 200]"


def test_min_max() -> None:
    result = convert_openapi_number_to_pydantic({"type": "integer", "minimum": 1, "maximum": 10})
    expected = (
        "Annotated[int, Field(strict=True, ge=1, le=10, "
        "json_schema_extra={'openapi': {'maximum': 10, 'minimum': 1}})]"
    )
    assert result == expected

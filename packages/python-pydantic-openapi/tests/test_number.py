from __future__ import annotations

from alt_stack_openapi_pydantic.types.number import convert_openapi_number_to_pydantic


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


def test_const_integer_is_a_single_literal() -> None:
    result = convert_openapi_number_to_pydantic({"type": "integer", "const": 1})
    assert result == "Literal[1]"


def test_integer_bounds_written_as_floats_render_as_ints() -> None:
    result = convert_openapi_number_to_pydantic(
        {"type": "integer", "minimum": 0.0, "maximum": 10.0}
    )
    expected = (
        "Annotated[int, Field(strict=True, ge=0, le=10, "
        "json_schema_extra={'openapi': {'maximum': 10.0, 'minimum': 0.0}})]"
    )
    assert result == expected


def test_number_bounds_keep_their_float_form() -> None:
    result = convert_openapi_number_to_pydantic({"type": "number", "minimum": 0.0})
    expected = (
        "Annotated[float, Field(strict=True, ge=0.0, "
        "json_schema_extra={'openapi': {'minimum': 0.0}})]"
    )
    assert result == expected


def test_min_max() -> None:
    result = convert_openapi_number_to_pydantic({"type": "integer", "minimum": 1, "maximum": 10})
    expected = (
        "Annotated[int, Field(strict=True, ge=1, le=10, "
        "json_schema_extra={'openapi': {'maximum': 10, 'minimum': 1}})]"
    )
    assert result == expected

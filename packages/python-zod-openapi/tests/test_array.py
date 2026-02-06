from __future__ import annotations

from python_zod_openapi.types.array import convert_openapi_array_to_pydantic


def _convert(schema: dict[str, object]) -> str:
    return convert_openapi_array_to_pydantic(schema, lambda s: "str")


def test_array_without_items() -> None:
    assert _convert({"type": "array"}) == "list[Any]"


def test_array_with_items() -> None:
    assert _convert({"type": "array", "items": {"type": "string"}}) == "list[str]"


def test_array_with_constraints() -> None:
    result = _convert({"type": "array", "minItems": 1, "maxItems": 3})
    expected = (
        "Annotated[list[Any], Field(min_length=1, max_length=3, "
        "json_schema_extra={'openapi': {'maxItems': 3, 'minItems': 1}})]"
    )
    assert result == expected

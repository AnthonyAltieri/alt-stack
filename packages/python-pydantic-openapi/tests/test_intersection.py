from __future__ import annotations

from alt_stack_openapi_pydantic.types.intersection import convert_openapi_intersection_to_pydantic


def test_intersection_basic() -> None:
    schema = {"allOf": [{"type": "string"}, {"type": "number"}]}
    result = convert_openapi_intersection_to_pydantic(
        schema,
        lambda s: "str" if s.get("type") == "string" else "float",
    )
    assert result == "all_of(str, float)"

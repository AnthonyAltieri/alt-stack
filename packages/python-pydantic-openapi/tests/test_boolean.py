from __future__ import annotations

from alt_stack_openapi_pydantic.types.boolean import convert_openapi_boolean_to_pydantic


def test_boolean_basic() -> None:
    assert (
        convert_openapi_boolean_to_pydantic({"type": "boolean"})
        == "Annotated[bool, Field(strict=True)]"
    )

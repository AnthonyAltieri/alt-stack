from __future__ import annotations

from python_zod_openapi.types.boolean import convert_openapi_boolean_to_pydantic


def test_boolean_basic() -> None:
    assert (
        convert_openapi_boolean_to_pydantic({"type": "boolean"})
        == "Annotated[bool, Field(strict=True)]"
    )

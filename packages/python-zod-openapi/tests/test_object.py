from __future__ import annotations

from python_zod_openapi.types.object import convert_openapi_object_to_pydantic


def test_object_default() -> None:
    assert (
        convert_openapi_object_to_pydantic({"type": "object"}, lambda _: "str") == "dict[str, Any]"
    )


def test_object_additional_properties() -> None:
    schema = {"type": "object", "additionalProperties": {"type": "string"}}
    result = convert_openapi_object_to_pydantic(schema, lambda _: "str")
    assert result == "dict[str, str]"

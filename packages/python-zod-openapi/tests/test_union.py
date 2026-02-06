from __future__ import annotations

from python_zod_openapi.types.union import convert_openapi_union_to_pydantic


def test_union_basic() -> None:
    schema = {"oneOf": [{"type": "string"}, {"type": "number"}]}
    result = convert_openapi_union_to_pydantic(
        schema, lambda s: "str" if s.get("type") == "string" else "float"
    )
    assert result == "Union[str, float]"


def test_union_with_discriminator() -> None:
    schema = {
        "oneOf": [{"$ref": "#/components/schemas/Cat"}, {"$ref": "#/components/schemas/Dog"}],
        "discriminator": {"propertyName": "kind", "mapping": {"cat": "#/components/schemas/Cat"}},
    }
    result = convert_openapi_union_to_pydantic(
        schema,
        lambda s: "Cat" if s.get("$ref", "").endswith("/Cat") else "Dog",
    )
    expected = (
        "Annotated[Union[Cat, Dog], Field(discriminator='kind', "
        "json_schema_extra={'openapi': {'discriminator': {'propertyName': 'kind', "
        "'mapping': {'cat': '#/components/schemas/Cat'}}}})]"
    )
    assert result == expected

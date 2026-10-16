from __future__ import annotations

import keyword
from typing import Any

import pytest
from pydantic import ValidationError

from alt_stack_openapi_pydantic import openapi_to_pydantic_code


@pytest.mark.parametrize(
    ("wire_name", "python_name"),
    [
        ("Rule-Output", "Rule_Output"),
        ("Order.Input", "Order_Input"),
        ("123Value", "_123Value"),
        ("class", "class_"),
    ],
)
def test_component_identifiers_resolve_references_and_route_maps(
    wire_name: str, python_name: str
) -> None:
    ref = {"$ref": f"#/components/schemas/{wire_name}"}
    schema = {
        "type": "object",
        "properties": {"name": {"type": "string", "enum": [wire_name]}},
        "required": ["name"],
        "additionalProperties": False,
    }
    spec = {
        "openapi": "3.1.0",
        "info": {"title": "Identifiers", "version": "1"},
        "components": {
            "schemas": {
                wire_name: schema,
                "Alias": ref,
                "Envelope": {
                    "type": "object",
                    "properties": {
                        "item": ref,
                        "items": {"type": "array", "items": ref},
                        "values": {"type": "object", "additionalProperties": ref},
                        "choice": {"anyOf": [ref, {"type": "null"}]},
                    },
                    "required": ["item", "items", "values", "choice"],
                },
                "Extended": {"allOf": [ref]},
            }
        },
        "paths": {
            "/items": {
                "post": {
                    "requestBody": {"content": {"application/json": {"schema": ref}}},
                    "responses": {"200": {"content": {"application/json": {"schema": ref}}}},
                }
            }
        },
    }
    namespace: dict[str, Any] = {}
    exec(openapi_to_pydantic_code(spec, options={"include_routes": True}), namespace)

    model = namespace[python_name]
    payload = {"name": wire_name}
    assert model.model_validate(payload).model_dump(by_alias=True) == payload
    assert namespace["Alias"].model_validate(payload).root == model.model_validate(payload)
    envelope = namespace["Envelope"].model_validate(
        {"item": payload, "items": [payload], "values": {"key": payload}, "choice": payload}
    )
    assert isinstance(envelope.item, model)
    assert isinstance(envelope.items[0], model)
    assert isinstance(envelope.values["key"], model)
    assert isinstance(envelope.choice, model)
    assert issubclass(namespace["Extended"], model)
    assert namespace["Request"]["/items"]["POST"]["body"] is model
    assert namespace["Response"]["/items"]["POST"]["200"] is model
    assert spec["components"]["schemas"][wire_name] == schema


@pytest.mark.parametrize(
    "names", [("Rule-Output", "Rule_Output"), ("class", "class_"), ("1", "_1")]
)
def test_component_identifier_collisions_fail_generation(names: tuple[str, str]) -> None:
    spec = {"components": {"schemas": {name: {"type": "string"} for name in names}}}

    with pytest.raises(ValueError, match="same Python identifier") as error:
        openapi_to_pydantic_code(spec)

    assert all(repr(name) in str(error.value) for name in names)


@pytest.mark.parametrize(
    "names",
    [
        ["_id", "id_", "id__2", "id"],
        ["_id", "id_", "id__2", "id", "__", "", "1st", "display-name", *keyword.kwlist],
    ],
    ids=["underscore", "invalid-and-keyword"],
)
def test_public_property_aliases_validate_and_round_trip_without_collisions(
    names: list[str],
) -> None:
    properties = {name: {"type": "string"} for name in names}
    properties["_meta"] = {"type": "string"}
    spec = {
        "components": {
            "schemas": {
                "Item": {
                    "type": "object",
                    "properties": properties,
                    "required": names,
                    "additionalProperties": False,
                }
            }
        }
    }
    namespace: dict[str, Any] = {}
    exec(openapi_to_pydantic_code(spec), namespace)
    model = namespace["Item"]

    assert len(model.model_fields) == len(properties)
    assert all(not name.startswith("_") for name in model.model_fields)
    assert all(name.isidentifier() and not keyword.iskeyword(name) for name in model.model_fields)
    payload = {name: f"value:{name}" for name in properties}
    instance = model.model_validate(payload)
    assert instance.id_ == payload["id_"]
    assert instance.model_dump(by_alias=True) == payload
    assert model.model_validate_json(instance.model_dump_json(by_alias=True)) == instance
    assert model.model_validate({name: payload[name] for name in names}).model_dump(
        by_alias=True, exclude_unset=True
    ) == {name: payload[name] for name in names}

    with pytest.raises(ValidationError):
        model.model_validate({**payload, "_id": 123})
    with pytest.raises(ValidationError):
        model.model_validate({name: value for name, value in payload.items() if name != "_id"})
    with pytest.raises(ValidationError):
        model.model_validate({**payload, "_meta": 123})

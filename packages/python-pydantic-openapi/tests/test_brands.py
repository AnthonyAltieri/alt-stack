from __future__ import annotations

from typing import Any, get_args
from uuid import UUID

import pytest
from pydantic import ValidationError

from alt_stack_openapi_pydantic import openapi_to_pydantic_code
from tests.test_route_typing import (
    PYREFLY_PATTERN,
    TY_PATTERN,
    _assert_route_contract,
    _check_with_pyrefly,
    _check_with_ty,
    _expected_error_lines,
)


def generate(schemas: dict[str, Any], paths: dict[str, Any] | None = None) -> tuple[str, Any]:
    code = openapi_to_pydantic_code(
        {"components": {"schemas": schemas}, "paths": paths or {}},
        options={"include_routes": True},
    )
    namespace: dict[str, Any] = {}
    exec(code, namespace)
    return code, namespace


def test_brands_share_types_and_preserve_validation_in_every_schema_position() -> None:
    identifier = {"type": "string", "format": "uuid", "x-altstack-brand": "UserId"}
    code, module = generate(
        {
            "UserId": identifier,
            "User": {
                "type": "object",
                "properties": {
                    "id": {"$ref": "#/components/schemas/UserId"},
                    "optional": {**identifier, "nullable": True},
                    "ids": {"type": "array", "items": identifier},
                    "choice": {"anyOf": [identifier, {"type": "null"}]},
                },
                "required": ["id", "ids", "choice"],
                "additionalProperties": False,
            },
        },
        {
            "/users/{id}": {
                "get": {
                    "parameters": [
                        {"name": "id", "in": "path", "required": True, "schema": identifier}
                    ],
                    "responses": {
                        "200": {
                            "content": {
                                "application/json": {
                                    "schema": {"$ref": "#/components/schemas/User"}
                                }
                            }
                        }
                    },
                }
            }
        },
    )
    assert code.count('UserId = NewType("UserId", UUID)') == 1
    assert module["UserId"].__supertype__ is UUID
    model = module["User"]
    assert model.model_fields["id"].annotation is module["UserId"]
    assert get_args(get_args(model.model_fields["ids"].annotation)[0])[0] is module["UserId"]
    value = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
    user = model.model_validate({"id": value, "ids": [value], "choice": None})
    assert user.id == UUID(value)
    assert user.optional is None
    assert (
        model.model_validate({"id": value, "ids": [], "choice": value, "optional": None}).optional
        is None
    )
    with pytest.raises(ValidationError):
        model.model_validate({"id": "invalid", "ids": [], "choice": None})
    params = module["Request"]["/users/{id}"]["GET"]["params"]
    assert params.model_fields["id"].annotation is module["UserId"]
    assert params.model_validate({"id": value}).id == UUID(value)
    assert module["Response"]["/users/{id}"]["GET"]["200"] is model


@pytest.mark.parametrize("brand", ["bad-name", "class", "", 123, None])
def test_invalid_brand_names_fail_generation(brand: Any) -> None:
    with pytest.raises(ValueError, match="Invalid x-altstack-brand"):
        generate({"Value": {"type": "string", "x-altstack-brand": brand}})


def test_conflicting_brand_bases_and_component_names_fail_generation() -> None:
    with pytest.raises(ValueError, match="Conflicting base types.*UserId"):
        generate(
            {
                "First": {"type": "string", "x-altstack-brand": "UserId"},
                "Second": {"type": "integer", "x-altstack-brand": "UserId"},
            }
        )
    with pytest.raises(ValueError, match="conflicts with component UserId"):
        generate(
            {
                "UserId": {"type": "integer"},
                "First": {"type": "string", "x-altstack-brand": "UserId"},
            }
        )
    with pytest.raises(ValueError, match="conflicts with a route model"):
        generate(
            {},
            {
                "/users/{id}": {
                    "get": {
                        "parameters": [
                            {
                                "name": "id",
                                "in": "path",
                                "required": True,
                                "schema": {
                                    "type": "string",
                                    "x-altstack-brand": "GetUsersIdParams",
                                },
                            }
                        ],
                        "responses": {},
                    }
                }
            },
        )


def test_empty_schema_rejects_non_json_values() -> None:
    _, module = generate({"Json": {}, "Value": {"type": "object", "properties": {"value": {}}}})
    model = module["Json"]
    assert model.model_validate({"key": [None, True, 1]}).root == {"key": [None, True, 1]}
    for value in (object(), float("nan"), float("inf")):
        with pytest.raises(ValidationError):
            model.model_validate({"key": value})
    assert module["Value"].model_validate({"value": None}).value is None


def test_exclusive_numeric_bounds_are_enforced() -> None:
    _, module = generate(
        {
            "Bounded": {
                "type": "number",
                "minimum": -1,
                "maximum": 11,
                "exclusiveMinimum": 0,
                "exclusiveMaximum": 10,
            }
        }
    )
    model = module["Bounded"]
    assert model.model_validate(5).root == 5
    for value in (0, 10, -1, 11):
        with pytest.raises(ValidationError):
            model.model_validate(value)


@pytest.mark.parametrize(
    ("check", "pattern"), [(_check_with_ty, TY_PATTERN), (_check_with_pyrefly, PYREFLY_PATTERN)]
)
def test_generated_brands_are_nominal_and_composite_bases_type_check(
    tmp_path, check, pattern
) -> None:
    code, module = generate(
        {
            "Identifier": {"type": "string", "x-altstack-brand": "UserId"},
            "Record": {
                "type": "object",
                "properties": {"id": {"type": "string", "x-altstack-brand": "UserId"}},
                "required": ["id"],
            },
            "UnionValue": {
                "anyOf": [{"type": "string"}, {"type": "integer"}],
                "x-altstack-brand": "ValueId",
            },
            "Constant": {"type": "string", "const": "fixed", "x-altstack-brand": "TagId"},
        }
    )
    assert module["UnionValue"].model_validate(1).root == 1
    assert module["Constant"].model_validate("fixed").root == "fixed"
    with pytest.raises(ValidationError):
        module["Constant"].model_validate("wrong")
    with pytest.raises(ValidationError):
        module["UnionValue"].model_validate({})
    consumer = "\n".join(
        [
            "from typing import assert_type",
            "from generated_sdk import Record, UserId",
            'record = Record.model_validate({"id": "value"})',
            "assert_type(record.id, UserId)",
            'plain: UserId = "value"  # expect-error',
        ]
    )
    (tmp_path / "generated_sdk.py").write_text(code)
    (tmp_path / "consumer.py").write_text(consumer)
    _assert_route_contract(check(tmp_path), pattern, _expected_error_lines(consumer))

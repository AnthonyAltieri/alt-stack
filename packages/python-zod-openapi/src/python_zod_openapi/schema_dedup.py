from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, TypedDict

from .types import AnySchema


def _sort_object_deep(obj: Any) -> Any:
    if obj is None or not isinstance(obj, (dict, list)):
        return obj
    if isinstance(obj, list):
        return [_sort_object_deep(item) for item in obj]
    sorted_obj: dict[str, Any] = {}
    for key in sorted(obj.keys()):
        sorted_obj[key] = _sort_object_deep(obj[key])
    return sorted_obj


def get_schema_fingerprint(schema: AnySchema) -> str:
    return json.dumps(_sort_object_deep(schema), sort_keys=True)


@dataclass
class SchemaRegistry:
    fingerprint_to_name: dict[str, str]


def create_schema_registry() -> SchemaRegistry:
    return SchemaRegistry(fingerprint_to_name={})


@dataclass
class RegisterSchemaResult:
    is_new: bool
    canonical_name: str


def register_schema(
    registry: SchemaRegistry,
    name: str,
    schema: AnySchema,
) -> RegisterSchemaResult:
    fingerprint = get_schema_fingerprint(schema)
    existing = registry.fingerprint_to_name.get(fingerprint)
    if existing:
        return RegisterSchemaResult(is_new=False, canonical_name=existing)
    registry.fingerprint_to_name[fingerprint] = name
    return RegisterSchemaResult(is_new=True, canonical_name=name)


def pre_register_schema(
    registry: SchemaRegistry,
    name: str,
    fingerprint: str,
) -> None:
    registry.fingerprint_to_name[fingerprint] = name


def extract_error_code(schema: AnySchema) -> str | None:
    props = schema.get("properties")
    if not isinstance(props, dict):
        return None
    error_obj = props.get("error")
    if not isinstance(error_obj, dict):
        return None
    error_props = error_obj.get("properties")
    if not isinstance(error_props, dict):
        return None
    code_schema = error_props.get("code")
    if not isinstance(code_schema, dict):
        return None
    code_enum = code_schema.get("enum")
    if isinstance(code_enum, list) and len(code_enum) == 1:
        return str(code_enum[0])
    return None


def error_code_to_pascal_case(code: str) -> str:
    return "".join(part.capitalize() for part in code.split("_"))


def generate_common_error_schema_name(error_code: str) -> str:
    return f"{error_code_to_pascal_case(error_code)}Error"


@dataclass
class CommonSchema:
    name: str
    schema: AnySchema
    fingerprint: str
    count: int


class NamedSchema(TypedDict):
    name: str
    schema: AnySchema


def find_common_schemas(
    schemas: list[NamedSchema],
    min_count: int = 2,
) -> list[CommonSchema]:
    fingerprints: dict[str, dict[str, Any]] = {}

    for item in schemas:
        name = item["name"]
        schema = item["schema"]
        fingerprint = get_schema_fingerprint(schema)
        existing = fingerprints.get(fingerprint)
        if existing:
            existing["names"].append(name)
        else:
            fingerprints[fingerprint] = {
                "schema": schema,
                "names": [name],
                "error_code": extract_error_code(schema),
            }

    common: list[CommonSchema] = []
    for fingerprint, data in fingerprints.items():
        names = data["names"]
        if len(names) < min_count:
            continue
        error_code = data["error_code"]
        name = (
            generate_common_error_schema_name(error_code)
            if isinstance(error_code, str)
            else names[0]
        )
        common.append(
            CommonSchema(
                name=name,
                schema=data["schema"],
                fingerprint=fingerprint,
                count=len(names),
            )
        )

    return sorted(common, key=lambda item: item.count, reverse=True)

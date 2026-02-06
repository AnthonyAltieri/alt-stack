from __future__ import annotations

from typing import Any

from ..registry import get_schema_exported_variable_name_for_primitive_type
from ..type_render import wrap_annotated


def _format_openapi_meta(meta: dict[str, Any]) -> str:
    ordered = {key: meta[key] for key in sorted(meta)}
    return f"json_schema_extra={{'openapi': {ordered!r}}}"


def convert_openapi_number_to_pydantic(schema: dict[str, Any]) -> str:
    if isinstance(schema.get("enum"), list):
        values = ", ".join(repr(value) for value in schema["enum"])
        return f"Literal[{values}]"

    schema_type = schema.get("type")
    if schema_type in {"number", "integer", "boolean"}:
        custom = get_schema_exported_variable_name_for_primitive_type(schema_type)
        if custom:
            return custom

    base = "int" if schema.get("type") == "integer" else "float"

    minimum = schema.get("minimum")
    maximum = schema.get("maximum")

    field_args: list[str] = ["strict=True"]
    if isinstance(minimum, (int, float)):
        field_args.append(f"ge={minimum}")
    if isinstance(maximum, (int, float)):
        field_args.append(f"le={maximum}")

    meta: dict[str, Any] = {}
    if isinstance(minimum, (int, float)):
        meta["minimum"] = minimum
    if isinstance(maximum, (int, float)):
        meta["maximum"] = maximum
    if meta:
        field_args.append(_format_openapi_meta(meta))

    return wrap_annotated(base, [f"Field({', '.join(field_args)})"])

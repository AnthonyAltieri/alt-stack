from __future__ import annotations

from typing import Any

from ..registry import get_schema_exported_variable_name_for_primitive_type
from ..type_render import wrap_annotated


def convert_openapi_boolean_to_pydantic(schema: dict[str, Any]) -> str:
    _ = schema
    custom = get_schema_exported_variable_name_for_primitive_type("boolean")
    if custom:
        return custom
    return wrap_annotated("bool", ["Field(strict=True)"])

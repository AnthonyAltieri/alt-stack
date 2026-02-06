from __future__ import annotations

from typing import Any, Callable


def convert_openapi_object_to_pydantic(
    schema: dict[str, Any],
    convert_schema: Callable[[dict[str, Any]], str],
) -> str:
    properties = schema.get("properties")
    additional = schema.get("additionalProperties")

    if not properties and not additional:
        return "dict[str, Any]"

    if isinstance(additional, dict):
        return f"dict[str, {convert_schema(additional)}]"

    return "dict[str, Any]"

from __future__ import annotations

from typing import Any, Callable


def convert_openapi_intersection_to_pydantic(
    schema: dict[str, Any],
    convert_schema: Callable[[dict[str, Any]], str],
) -> str:
    items = schema.get("allOf")
    if not isinstance(items, list):
        return "Any"

    parts = [convert_schema(item) for item in items if isinstance(item, dict)]
    if not parts:
        return "Any"
    if len(parts) == 1:
        return parts[0]

    return f"all_of({', '.join(parts)})"

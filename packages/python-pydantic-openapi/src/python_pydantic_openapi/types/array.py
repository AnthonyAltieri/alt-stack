from __future__ import annotations

from typing import Any, Callable

from ..type_render import format_openapi_metadata, wrap_annotated


def convert_openapi_array_to_pydantic(
    schema: dict[str, Any],
    convert_schema: Callable[[dict[str, Any]], str],
) -> str:
    items = schema.get("items")
    item_type = "Any"
    if isinstance(items, dict):
        item_type = convert_schema(items)

    base = f"list[{item_type}]"

    min_items = schema.get("minItems")
    max_items = schema.get("maxItems")

    field_args: list[str] = []
    if isinstance(min_items, int):
        field_args.append(f"min_length={min_items}")
    if isinstance(max_items, int):
        field_args.append(f"max_length={max_items}")

    meta: dict[str, Any] = {}
    if isinstance(min_items, int):
        meta["minItems"] = min_items
    if isinstance(max_items, int):
        meta["maxItems"] = max_items
    if meta:
        field_args.append(format_openapi_metadata(meta))

    if field_args:
        return wrap_annotated(base, [f"Field({', '.join(field_args)})"])

    return base

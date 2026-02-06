from __future__ import annotations

from typing import Any, Callable

from ..type_render import wrap_annotated


def _format_openapi_meta(meta: dict[str, Any]) -> str:
    ordered = {key: meta[key] for key in sorted(meta)}
    return f"json_schema_extra={{'openapi': {ordered!r}}}"


def convert_openapi_union_to_pydantic(
    schema: dict[str, Any],
    convert_schema: Callable[[dict[str, Any]], str],
) -> str:
    items = schema.get("oneOf")
    if not isinstance(items, list):
        return "Any"

    item_types = [convert_schema(item) for item in items if isinstance(item, dict)]
    if not item_types:
        return "Any"

    union_expr = f"Union[{', '.join(item_types)}]" if len(item_types) > 1 else item_types[0]

    discriminator = schema.get("discriminator")
    field_args: list[str] = []
    meta: dict[str, Any] = {}
    if isinstance(discriminator, dict):
        property_name = discriminator.get("propertyName")
        if isinstance(property_name, str) and property_name:
            field_args.append(f"discriminator={property_name!r}")
            meta["discriminator"] = discriminator

    if meta:
        field_args.append(_format_openapi_meta(meta))

    if field_args:
        return wrap_annotated(union_expr, [f"Field({', '.join(field_args)})"])

    return union_expr

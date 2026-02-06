from __future__ import annotations

from typing import Any

from ..registry import get_schema_exported_variable_name_for_string_format
from ..type_render import wrap_annotated


def _format_openapi_meta(meta: dict[str, Any]) -> str:
    ordered = {key: meta[key] for key in sorted(meta)}
    return f"json_schema_extra={{'openapi': {ordered!r}}}"


def convert_openapi_string_to_pydantic(schema: dict[str, Any]) -> str:
    if isinstance(schema.get("enum"), list):
        values = ", ".join(repr(value) for value in schema["enum"])
        return f"Literal[{values}]"

    fmt = schema.get("format")
    if isinstance(fmt, str) and fmt:
        custom_schema = get_schema_exported_variable_name_for_string_format(fmt)
        if custom_schema:
            return custom_schema
    else:
        fmt = None

    base = "str"
    if fmt == "email":
        base = "EmailStr"
    elif fmt in {"url", "uri"}:
        base = "AnyUrl"
    elif fmt == "uuid":
        base = "UUID"

    min_length = schema.get("minLength")
    max_length = schema.get("maxLength")
    pattern = schema.get("pattern")
    pattern_is_explicit = isinstance(pattern, str)

    if fmt == "color-hex" and not pattern_is_explicit:
        pattern = "^[a-fA-F0-9]{6}$"

    field_args: list[str] = []
    if base == "str":
        field_args.append("strict=True")
    if isinstance(min_length, int):
        field_args.append(f"min_length={min_length}")
    if isinstance(max_length, int):
        field_args.append(f"max_length={max_length}")
    if isinstance(pattern, str):
        field_args.append(f"pattern={pattern!r}")

    meta: dict[str, Any] = {}
    if isinstance(fmt, str):
        meta["format"] = fmt
    if isinstance(pattern, str) and pattern_is_explicit:
        meta["pattern"] = pattern
    if isinstance(min_length, int):
        meta["minLength"] = min_length
    if isinstance(max_length, int):
        meta["maxLength"] = max_length

    if meta:
        field_args.append(_format_openapi_meta(meta))

    if field_args:
        return wrap_annotated(base, [f"Field({', '.join(field_args)})"])

    return base

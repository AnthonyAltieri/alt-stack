from __future__ import annotations

from typing import Any


def format_openapi_metadata(meta: dict[str, Any]) -> str:
    ordered = {key: meta[key] for key in sorted(meta)}
    return f"json_schema_extra={{'openapi': {ordered!r}}}"


def wrap_annotated(base: str, metadata: list[str]) -> str:
    if not metadata:
        return base
    parts = ", ".join(metadata)
    return f"Annotated[{base}, {parts}]"

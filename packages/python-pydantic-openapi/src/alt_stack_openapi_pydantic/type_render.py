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


def literal_type_expr(schema: dict[str, Any]) -> str | None:
    """Render ``enum`` values, or a single-value ``const``, as ``Literal[...]``.

    OpenAPI 3.1 documents (and Pydantic-exported schemas) express a fixed value with
    ``const``; treating it as a one-member enum keeps discriminated unions valid, because
    Pydantic requires the discriminator field of every member to be a ``Literal``.
    """
    values = schema.get("enum")
    if not isinstance(values, list):
        if "const" not in schema:
            return None
        values = [schema["const"]]
    rendered = ", ".join(repr(value) for value in values)
    return f"Literal[{rendered}]"


def integer_bound(value: Any, base: str) -> Any:
    """Render an integer field's bound as an ``int`` when the document spells it ``0.0``."""
    if base == "int" and isinstance(value, float) and value.is_integer():
        return int(value)
    return value

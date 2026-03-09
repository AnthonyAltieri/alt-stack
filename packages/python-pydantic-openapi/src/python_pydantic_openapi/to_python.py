from __future__ import annotations

from .emission import openapi_to_pydantic_code
from .rendering import schema_to_type_expr
from .types import AnySchema


def convert_schema_to_pydantic_string(schema: AnySchema | None) -> str:
    return schema_to_type_expr(schema)


__all__ = ["convert_schema_to_pydantic_string", "openapi_to_pydantic_code"]

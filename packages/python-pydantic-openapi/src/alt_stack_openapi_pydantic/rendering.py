from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import unquote

from .registry import (
    get_schema_exported_variable_name_for_primitive_type,
    get_schema_exported_variable_name_for_string_format,
)
from .type_render import format_openapi_metadata, literal_type_expr
from .types import AnySchema
from .types.array import convert_openapi_array_to_pydantic
from .types.boolean import convert_openapi_boolean_to_pydantic
from .types.intersection import convert_openapi_intersection_to_pydantic
from .types.number import convert_openapi_number_to_pydantic
from .types.object import convert_openapi_object_to_pydantic
from .types.string import convert_openapi_string_to_pydantic
from .types.union import convert_openapi_union_to_pydantic


@dataclass(slots=True)
class RenderContext:
    root_model_names: set[str] = field(default_factory=set)


def decode_component_ref(ref: str) -> str:
    if ref.startswith("#/components/schemas/"):
        return unquote(ref.split("#/components/schemas/")[1])
    return ref


def is_freeform_object_schema(schema: AnySchema) -> bool:
    if not isinstance(schema, dict):
        return False
    if schema.get("type") != "object" and "properties" not in schema:
        return False
    return not schema.get("properties") and schema.get("additionalProperties") is not False


def is_object_model_schema(schema: AnySchema) -> bool:
    if not isinstance(schema, dict):
        return False
    properties = schema.get("properties")
    if schema.get("type") == "object" or properties is not None:
        if isinstance(properties, dict) and properties:
            return True
        return schema.get("additionalProperties") is False

    parts = schema.get("allOf")
    if not isinstance(parts, list) or not parts:
        return False

    saw_object_part = False
    for part in parts:
        if not isinstance(part, dict):
            return False
        if isinstance(part.get("$ref"), str):
            saw_object_part = True
            continue
        if part.get("type") == "object" or "properties" in part:
            saw_object_part = True
            continue
        return False
    return saw_object_part


def needs_named_model(schema: AnySchema) -> bool:
    return is_object_model_schema(schema)


def schema_to_type_expr(
    schema: AnySchema | None,
    *,
    context: RenderContext | None = None,
) -> str:
    if not isinstance(schema, dict):
        return "Any"

    render_context = context or RenderContext()

    # OpenAPI 3.1 spells "may be null" three ways; all of them render as Optional[...].
    if schema.get("type") == "null":
        return "None"
    without_null = strip_null_member(schema)
    if without_null is not None:
        return f"Optional[{schema_to_type_expr(without_null, context=render_context)}]"

    if isinstance(schema.get("$ref"), str):
        ref = schema["$ref"]
        if not ref.startswith("#/components/schemas/"):
            return wrap_nullable("Any", schema)
        expr = decode_component_ref(ref)
        return wrap_nullable(expr, schema)

    if isinstance(schema.get("oneOf"), list):
        expr = convert_openapi_union_to_pydantic(
            schema,
            lambda child: schema_to_type_expr(child, context=render_context),
        )
        return wrap_nullable(expr, schema)

    if isinstance(schema.get("anyOf"), list):
        expr = convert_openapi_union_to_pydantic(
            {"oneOf": schema["anyOf"], "discriminator": schema.get("discriminator")},
            lambda child: schema_to_type_expr(child, context=render_context),
        )
        return wrap_nullable(expr, schema)

    if isinstance(schema.get("allOf"), list):
        expr = convert_openapi_intersection_to_pydantic(
            schema,
            lambda child: schema_to_type_expr(child, context=render_context),
        )
        return wrap_nullable(expr, schema)

    schema_type = schema.get("type")

    if schema_type == "string":
        expr = convert_openapi_string_to_pydantic(schema)
        return wrap_nullable(expr, schema)

    if schema_type in {"number", "integer"}:
        expr = convert_openapi_number_to_pydantic(schema)
        return wrap_nullable(expr, schema)

    if schema_type == "boolean":
        expr = convert_openapi_boolean_to_pydantic(schema)
        return wrap_nullable(expr, schema)

    if schema_type == "array":
        expr = convert_openapi_array_to_pydantic(
            schema,
            lambda child: schema_to_type_expr(child, context=render_context),
        )
        return wrap_nullable(expr, schema)

    if schema_type == "object" or "properties" in schema:
        expr = convert_openapi_object_to_pydantic(
            schema,
            lambda child: schema_to_type_expr(child, context=render_context),
        )
        return wrap_nullable(expr, schema)

    literal = literal_type_expr(schema)
    if literal is not None:
        return wrap_nullable(literal, schema)

    return wrap_nullable("Any", schema)


def wrap_nullable(expr: str, schema: dict[str, Any]) -> str:
    if schema.get("nullable") is True:
        return f"Optional[{expr}]"
    return expr


def _is_null_schema(schema: Any) -> bool:
    return isinstance(schema, dict) and schema.get("type") == "null" and len(schema) <= 2


def strip_null_member(schema: dict[str, Any]) -> dict[str, Any] | None:
    """Return the schema without its null alternative, or None when it has none.

    Handles ``type: ["string", "null"]`` and ``anyOf``/``oneOf`` compositions that include a
    ``{"type": "null"}`` member. A composition left with one member collapses to that member so
    the caller renders ``Optional[Member]`` rather than ``Optional[Union[Member]]``.
    """
    type_value = schema.get("type")
    if isinstance(type_value, list) and "null" in type_value:
        remaining = [item for item in type_value if item != "null"]
        stripped = dict(schema)
        if len(remaining) == 1:
            stripped["type"] = remaining[0]
        else:
            stripped.pop("type")
            stripped["anyOf"] = [{"type": item} for item in remaining]
        return stripped
    for keyword in ("anyOf", "oneOf"):
        members = schema.get(keyword)
        if isinstance(members, list) and any(_is_null_schema(member) for member in members):
            remaining = [member for member in members if not _is_null_schema(member)]
            stripped = {key: value for key, value in schema.items() if key != keyword}
            if len(remaining) == 1 and isinstance(remaining[0], dict):
                merged = dict(remaining[0])
                for key in ("description", "title", "default"):
                    if key in stripped and key not in merged:
                        merged[key] = stripped[key]
                return merged
            stripped[keyword] = remaining
            return stripped
    return None


def is_nullable_schema(schema: Any) -> bool:
    """True when the schema admits null: ``nullable: true``, ``type: "null"``, or a null member."""
    if not isinstance(schema, dict):
        return False
    if schema.get("nullable") is True or schema.get("type") == "null":
        return True
    return strip_null_member(schema) is not None


def registered_output_alias(schema: AnySchema, context: RenderContext | None = None) -> str | None:
    if not isinstance(schema, dict):
        return None

    if schema.get("type") == "string" and isinstance(schema.get("format"), str):
        custom = get_schema_exported_variable_name_for_string_format(schema["format"])
        if custom:
            return custom

    primitive_type = schema.get("type")
    if primitive_type in {"number", "integer", "boolean"}:
        custom = get_schema_exported_variable_name_for_primitive_type(primitive_type)
        if custom:
            return custom

    if context is None:
        return None

    if isinstance(schema.get("$ref"), str):
        name = decode_component_ref(schema["$ref"])
        if name in context.root_model_names:
            return name

    return None


def root_model_annotation(type_expr: str) -> str:
    return f"RootModel[{type_expr}]"


def extra_field_annotation(value_type: str) -> str:
    return f"dict[str, {value_type}]"


__all__ = [
    "RenderContext",
    "decode_component_ref",
    "extra_field_annotation",
    "format_openapi_metadata",
    "is_freeform_object_schema",
    "is_object_model_schema",
    "needs_named_model",
    "registered_output_alias",
    "root_model_annotation",
    "schema_to_type_expr",
]

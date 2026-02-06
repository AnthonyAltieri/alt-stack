from __future__ import annotations

from .registry import (
    get_schema_exported_variable_name_for_primitive_type,
    get_schema_exported_variable_name_for_string_format,
)
from .types import AnySchema

_VALID_IDENTIFIER = "_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


def _quote_property_name(name: str) -> str:
    if name and name[0].isalpha() and all(ch in _VALID_IDENTIFIER for ch in name):
        return name
    return repr(name)


def _to_pascal_case(name: str) -> str:
    parts = []
    current = ""
    for ch in name:
        if ch.isalnum():
            current += ch
        else:
            if current:
                parts.append(current)
                current = ""
    if current:
        parts.append(current)
    return "".join(part[:1].upper() + part[1:] for part in parts if part)


def schema_export_name_to_output_alias(name: str) -> str:
    return f"{_to_pascal_case(name)}Output"


def _register_output_schema_name(schema_name: str, output_schema_names: set[str] | None) -> str:
    if output_schema_names is not None:
        output_schema_names.add(schema_name)
    return schema_export_name_to_output_alias(schema_name)


def _get_registered_output_alias(
    schema: AnySchema,
    output_schema_names: set[str] | None = None,
) -> str | None:
    if not isinstance(schema, dict):
        return None

    if schema.get("type") == "string" and isinstance(schema.get("format"), str):
        custom = get_schema_exported_variable_name_for_string_format(schema["format"])
        if custom:
            return _register_output_schema_name(custom, output_schema_names)

    if schema.get("type") in {"number", "integer", "boolean"}:
        custom = get_schema_exported_variable_name_for_primitive_type(schema["type"])
        if custom:
            return _register_output_schema_name(custom, output_schema_names)

    return None


def schema_to_type_string(
    schema: AnySchema,
    *,
    output_schema_names: set[str] | None = None,
) -> str:
    if not isinstance(schema, dict):
        return "Any"

    if isinstance(schema.get("$ref"), str):
        ref = schema["$ref"]
        if ref.startswith("#/components/schemas/"):
            name = ref.split("#/components/schemas/")[1]
            return name.replace("%20", " ")
        return "Any"

    if "oneOf" in schema and isinstance(schema["oneOf"], list):
        members = [
            schema_to_type_string(item, output_schema_names=output_schema_names)
            for item in schema["oneOf"]
        ]
        if not members:
            return "Any"
        return f"Union[{', '.join(members)}]" if len(members) > 1 else members[0]

    if "allOf" in schema and isinstance(schema["allOf"], list):
        members = [
            schema_to_type_string(item, output_schema_names=output_schema_names)
            for item in schema["allOf"]
        ]
        if not members:
            return "Any"
        return f"AllOf[{', '.join(members)}]" if len(members) > 1 else members[0]

    if "anyOf" in schema and isinstance(schema["anyOf"], list):
        members = [
            schema_to_type_string(item, output_schema_names=output_schema_names)
            for item in schema["anyOf"]
        ]
        if not members:
            return "Any"
        return f"Union[{', '.join(members)}]" if len(members) > 1 else members[0]

    schema_type = schema.get("type")

    if schema_type == "string":
        registered = _get_registered_output_alias(schema, output_schema_names)
        if registered:
            return registered
        if isinstance(schema.get("enum"), list):
            values = ", ".join(repr(value) for value in schema["enum"])
            return f"Literal[{values}]"
        return "str"

    if schema_type in {"number", "integer"}:
        registered = _get_registered_output_alias(schema, output_schema_names)
        if registered:
            return registered
        if isinstance(schema.get("enum"), list):
            values = ", ".join(repr(value) for value in schema["enum"])
            return f"Literal[{values}]"
        return "int" if schema_type == "integer" else "float"

    if schema_type == "boolean":
        registered = _get_registered_output_alias(schema, output_schema_names)
        return registered or "bool"

    if schema_type == "null":
        return "None"

    if schema_type == "array":
        items = schema.get("items")
        if isinstance(items, dict):
            item_type = schema_to_type_string(items, output_schema_names=output_schema_names)
            return f"list[{item_type}]"
        return "list[Any]"

    if schema_type == "object" or "properties" in schema:
        return _object_schema_to_type_string(schema, output_schema_names)

    if isinstance(schema.get("enum"), list):
        values = ", ".join(repr(value) for value in schema["enum"])
        return f"Literal[{values}]"

    return "Any"


def _object_schema_to_type_string(
    schema: AnySchema,
    output_schema_names: set[str] | None = None,
) -> str:
    properties = schema.get("properties")
    required = set(schema.get("required", []))
    additional = schema.get("additionalProperties")

    if not properties and not additional:
        return "dict[str, Any]"

    parts: list[str] = []

    if isinstance(properties, dict):
        for prop_name, prop_schema in properties.items():
            prop_type = schema_to_type_string(prop_schema, output_schema_names=output_schema_names)
            quoted = _quote_property_name(prop_name)
            suffix = "" if prop_name in required else "?"
            parts.append(f"{quoted}{suffix}: {prop_type}")

    if additional is True:
        parts.append("[key: str]: Any")
    elif isinstance(additional, dict):
        additional_type = schema_to_type_string(additional, output_schema_names=output_schema_names)
        parts.append(f"[key: str]: {additional_type}")

    return "{ " + "; ".join(parts) + " }"


def generate_interface(
    name: str,
    schema: AnySchema,
    *,
    output_schema_names: set[str] | None = None,
) -> str:
    properties = schema.get("properties") if isinstance(schema, dict) else None

    if not isinstance(schema, dict) or (schema.get("type") != "object" and not properties):
        type_str = schema_to_type_string(schema, output_schema_names=output_schema_names)
        return f"{name}: TypeAlias = {type_str}"

    lines: list[str] = []
    lines.append(f"class {name}(TypedDict):")

    if isinstance(properties, dict):
        required = set(schema.get("required", []))
        for prop_name, prop_schema in properties.items():
            prop_type = schema_to_type_string(prop_schema, output_schema_names=output_schema_names)
            quoted = _quote_property_name(prop_name)
            if prop_name in required:
                lines.append(f"    {quoted}: {prop_type}")
            else:
                lines.append(f"    {quoted}: NotRequired[{prop_type}]")

    additional = schema.get("additionalProperties")
    if additional is True:
        lines.append("    __extra__: dict[str, Any]")
    elif isinstance(additional, dict):
        additional_type = schema_to_type_string(additional, output_schema_names=output_schema_names)
        lines.append(f"    __extra__: dict[str, {additional_type}]")

    if len(lines) == 1:
        lines.append("    pass")

    return "\n".join(lines)

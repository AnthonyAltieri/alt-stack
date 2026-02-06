from __future__ import annotations

import keyword
from typing import Any
from urllib.parse import unquote

from .dependencies import topological_sort_schemas
from .routes import RouteInfo, generate_route_schema_names, parse_openapi_paths
from .schema_dedup import (
    NamedSchema,
    create_schema_registry,
    find_common_schemas,
    get_schema_fingerprint,
    pre_register_schema,
    register_schema,
)
from .types import AnySchema
from .types.array import convert_openapi_array_to_pydantic
from .types.boolean import convert_openapi_boolean_to_pydantic
from .types.intersection import convert_openapi_intersection_to_pydantic
from .types.number import convert_openapi_number_to_pydantic
from .types.object import convert_openapi_object_to_pydantic
from .types.string import convert_openapi_string_to_pydantic
from .types.union import convert_openapi_union_to_pydantic
from .utils import to_pascal_case

_VALID_IDENTIFIER_CHARS = set("_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")


def _decode_ref_name(ref: str) -> str:
    if ref.startswith("#/components/schemas/"):
        return unquote(ref.split("#/components/schemas/")[1])
    return ref


def _schema_to_type_expr(schema: AnySchema | None) -> str:
    if not isinstance(schema, dict):
        return "Any"

    if isinstance(schema.get("$ref"), str):
        ref = schema["$ref"]
        if not ref.startswith("#/components/schemas/"):
            return _wrap_nullable("Any", schema)
        expr = _decode_ref_name(ref)
        return _wrap_nullable(expr, schema)

    if isinstance(schema.get("oneOf"), list):
        expr = convert_openapi_union_to_pydantic(schema, _schema_to_type_expr)
        return _wrap_nullable(expr, schema)

    if isinstance(schema.get("allOf"), list):
        expr = convert_openapi_intersection_to_pydantic(schema, _schema_to_type_expr)
        return _wrap_nullable(expr, schema)

    schema_type = schema.get("type")

    if schema_type == "string":
        expr = convert_openapi_string_to_pydantic(schema)
        return _wrap_nullable(expr, schema)

    if schema_type in {"number", "integer"}:
        expr = convert_openapi_number_to_pydantic(schema)
        return _wrap_nullable(expr, schema)

    if schema_type == "boolean":
        expr = convert_openapi_boolean_to_pydantic(schema)
        return _wrap_nullable(expr, schema)

    if schema_type == "array":
        expr = convert_openapi_array_to_pydantic(schema, _schema_to_type_expr)
        return _wrap_nullable(expr, schema)

    if schema_type == "object" or "properties" in schema:
        expr = convert_openapi_object_to_pydantic(schema, _schema_to_type_expr)
        return _wrap_nullable(expr, schema)

    if isinstance(schema.get("enum"), list):
        values = ", ".join(repr(value) for value in schema["enum"])
        expr = f"Literal[{values}]"
        return _wrap_nullable(expr, schema)

    return _wrap_nullable("Any", schema)


def _wrap_nullable(expr: str, schema: dict[str, Any]) -> str:
    if schema.get("nullable") is True:
        return f"Optional[{expr}]"
    return expr


def _is_freeform_object(schema: AnySchema) -> bool:
    if not isinstance(schema, dict):
        return False
    if schema.get("type") != "object" and "properties" not in schema:
        return False
    return not schema.get("properties") and schema.get("additionalProperties") is not False


def _should_inline_object_model(schema: AnySchema) -> bool:
    if not isinstance(schema, dict):
        return False
    if schema.get("$ref") or schema.get("oneOf") or schema.get("allOf"):
        return False
    if schema.get("type") != "object" and "properties" not in schema:
        return False
    if _is_freeform_object(schema):
        return False
    return True


def _extract_inline_object_models(
    parent_name: str,
    schema: AnySchema,
) -> tuple[list[str], AnySchema]:
    if not isinstance(schema, dict):
        return [], schema

    properties = schema.get("properties")
    if not isinstance(properties, dict):
        return [], schema

    nested_lines: list[str] = []
    updated_props = dict(properties)

    for prop_name, prop_schema in properties.items():
        if not _should_inline_object_model(prop_schema):
            continue

        nested_name = f"{parent_name}{to_pascal_case(prop_name)}"
        nested_lines.extend(_emit_schema_definition(nested_name, prop_schema))
        ref_schema: dict[str, Any] = {
            "$ref": f"#/components/schemas/{nested_name}",
        }
        if isinstance(prop_schema, dict) and prop_schema.get("nullable") is True:
            ref_schema["nullable"] = True
        updated_props[prop_name] = ref_schema

    if updated_props == properties:
        return nested_lines, schema

    updated_schema = dict(schema)
    updated_schema["properties"] = updated_props
    return nested_lines, updated_schema


def _sanitize_identifier(name: str) -> str:
    result = "".join(ch if ch in _VALID_IDENTIFIER_CHARS else "_" for ch in name)
    if result and result[0].isupper() and result[1:].islower():
        result = result[0].lower() + result[1:]
    if not result or result[0].isdigit():
        result = f"_{result}"
    if keyword.iskeyword(result):
        result = f"{result}_"
    return result


def _dedupe_name(name: str, used: set[str]) -> str:
    if name not in used:
        used.add(name)
        return name
    index = 2
    while f"{name}_{index}" in used:
        index += 1
    deduped = f"{name}_{index}"
    used.add(deduped)
    return deduped


def _generate_model_lines(
    name: str,
    schema: AnySchema,
    *,
    base_classes: list[str] | None = None,
) -> list[str]:
    properties = schema.get("properties") if isinstance(schema, dict) else None
    required = set(schema.get("required", [])) if isinstance(schema, dict) else set()
    additional = schema.get("additionalProperties") if isinstance(schema, dict) else None

    bases = base_classes or ["BaseModel"]
    lines = [f"class {name}({', '.join(bases)}):"]

    alias_used = False
    field_lines: list[str] = []
    used_names: set[str] = set()

    if isinstance(properties, dict):
        for prop_name, prop_schema in properties.items():
            attr_name = _dedupe_name(_sanitize_identifier(prop_name), used_names)
            alias = prop_name if attr_name != prop_name else None
            if alias:
                alias_used = True

            type_expr = _schema_to_type_expr(prop_schema)
            is_required = prop_name in required

            if is_required:
                if alias:
                    default_expr = f" = Field(alias={alias!r})"
                else:
                    default_expr = ""
            else:
                if alias:
                    default_expr = f" = Field(default=None, alias={alias!r})"
                else:
                    default_expr = " = None"

            field_lines.append(f"    {attr_name}: {type_expr}{default_expr}")

    config_args: list[str] = []
    if alias_used:
        config_args.append("populate_by_name=True")
    if additional is False:
        config_args.append("extra='forbid'")

    if config_args:
        lines.append(f"    model_config = ConfigDict({', '.join(config_args)})")

    if field_lines:
        lines.extend(field_lines)
    else:
        lines.append("    pass")

    return lines


def _emit_schema_definition(name: str, schema: AnySchema) -> list[str]:
    if isinstance(schema, dict) and isinstance(schema.get("allOf"), list):
        base_classes: list[str] = []
        inline_properties: dict[str, Any] = {}
        inline_required: list[str] = []
        additional_properties: Any = None
        non_object_part = False

        for part in schema["allOf"]:
            if not isinstance(part, dict):
                continue
            if isinstance(part.get("$ref"), str):
                base_classes.append(_decode_ref_name(part["$ref"]))
                continue
            if part.get("type") == "object" or "properties" in part:
                props = part.get("properties")
                if isinstance(props, dict):
                    inline_properties.update(props)
                required = part.get("required")
                if isinstance(required, list):
                    for item in required:
                        if item not in inline_required:
                            inline_required.append(item)
                if part.get("additionalProperties") is False:
                    additional_properties = False
                continue
            non_object_part = True

        if not non_object_part:
            merged_schema: dict[str, Any] = {
                "type": "object",
                "properties": inline_properties,
                "required": inline_required,
            }
            if additional_properties is False:
                merged_schema["additionalProperties"] = False
            nested_lines, merged_schema = _extract_inline_object_models(name, merged_schema)
            model_lines = _generate_model_lines(
                name,
                merged_schema,
                base_classes=base_classes or None,
            )
            model_lines.insert(1, f"    __openapi_allof__ = {schema['allOf']!r}")
            return [
                *nested_lines,
                *model_lines,
                f"{name}.model_rebuild()",
                f"{name}Schema = TypeAdapter({name})",
                "",
            ]

    if _is_freeform_object(schema):
        return [
            f"{name}: TypeAlias = dict[str, Any]",
            f"{name}Schema = TypeAdapter({name})",
            "",
        ]

    if isinstance(schema, dict) and (schema.get("type") == "object" or "properties" in schema):
        nested_lines, schema = _extract_inline_object_models(name, schema)
        model_lines = _generate_model_lines(name, schema)
        return [
            *nested_lines,
            *model_lines,
            f"{name}.model_rebuild()",
            f"{name}Schema = TypeAdapter({name})",
            "",
        ]

    type_expr = _schema_to_type_expr(schema)
    return [
        f"{name}: TypeAlias = {type_expr}",
        f"{name}Schema = TypeAdapter({name})",
        "",
    ]


def _emit_schema_alias(name: str, canonical: str) -> list[str]:
    return [
        f"{name} = {canonical}",
        f"{name}Schema = {canonical}Schema",
    ]


def _collect_route_schemas(routes: list[RouteInfo]) -> list[NamedSchema]:
    collected: list[NamedSchema] = []

    for route in routes:
        for status_code, response_schema in route.responses.items():
            if not response_schema:
                continue
            suffix = "Response" if status_code.startswith("2") else "ErrorResponse"
            response_schema_name = _generate_route_schema_name(
                route.path, route.method, f"{status_code}{suffix}"
            )
            collected.append({"name": response_schema_name, "schema": response_schema})

    return collected


def _build_openapi_object_schema(params: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {param["name"]: param["schema"] for param in params},
        "required": [param["name"] for param in params if param.get("required")],
    }


def _generate_route_schema_name(path: str, method: str, suffix: str) -> str:
    parts = [
        segment.strip("{}").replace("-", " ").replace("_", " ")
        for segment in path.split("/")
        if segment
    ]
    pascal_parts = ["".join(word.capitalize() for word in part.split()) for part in parts]
    method_prefix = method[0] + method[1:].lower()
    return "".join([method_prefix, *pascal_parts, suffix])


def _generate_route_schemas(
    routes: list[RouteInfo],
    registry: Any,
) -> tuple[list[str], dict[str, str]]:
    declarations: list[str] = []
    schema_name_to_canonical: dict[str, str] = {}

    def register_and_emit(schema_name: str, schema: AnySchema) -> None:
        result = register_schema(registry, schema_name, schema)
        schema_name_to_canonical[schema_name] = result.canonical_name

        if result.is_new:
            declarations.extend(_emit_schema_definition(schema_name, schema))
            return

        if schema_name != result.canonical_name:
            declarations.extend(_emit_schema_alias(schema_name, result.canonical_name))
            declarations.append("")

    for route in routes:
        names = generate_route_schema_names(route)
        path_params = [p for p in route.parameters if p.location == "path"]
        query_params = [p for p in route.parameters if p.location == "query"]
        header_params = [p for p in route.parameters if p.location == "header"]

        if names.params_schema_name and path_params:
            params_schema = _build_openapi_object_schema(
                [{"name": p.name, "schema": p.schema, "required": True} for p in path_params]
            )
            register_and_emit(names.params_schema_name, params_schema)

        if names.query_schema_name and query_params:
            query_schema = _build_openapi_object_schema(
                [
                    {
                        "name": p.name,
                        "schema": p.schema,
                        "required": p.required,
                    }
                    for p in query_params
                ]
            )
            register_and_emit(names.query_schema_name, query_schema)

        if names.headers_schema_name and header_params:
            headers_schema = _build_openapi_object_schema(
                [
                    {
                        "name": p.name,
                        "schema": p.schema,
                        "required": p.required,
                    }
                    for p in header_params
                ]
            )
            register_and_emit(names.headers_schema_name, headers_schema)

        if names.body_schema_name and route.request_body is not None:
            register_and_emit(names.body_schema_name, route.request_body)

        for status_code, response_schema in route.responses.items():
            if not response_schema:
                continue
            suffix = "Response" if status_code.startswith("2") else "ErrorResponse"
            response_schema_name = _generate_route_schema_name(
                route.path, route.method, f"{status_code}{suffix}"
            )
            register_and_emit(response_schema_name, response_schema)

    return declarations, schema_name_to_canonical


def _generate_request_response_objects(
    routes: list[RouteInfo],
    schema_name_to_canonical: dict[str, str],
) -> list[str]:
    lines: list[str] = []
    request_paths: dict[str, dict[str, list[tuple[str, str]]]] = {}
    response_paths: dict[str, dict[str, dict[str, str]]] = {}

    def resolve_schema_name(name: str) -> str:
        return schema_name_to_canonical.get(name, name)

    for route in routes:
        names = generate_route_schema_names(route)
        path_params = [p for p in route.parameters if p.location == "path"]
        query_params = [p for p in route.parameters if p.location == "query"]
        header_params = [p for p in route.parameters if p.location == "header"]

        request_paths.setdefault(route.path, {})
        request_paths[route.path].setdefault(route.method, [])
        request_parts: list[tuple[str, str]] = []

        if names.params_schema_name and path_params:
            request_parts.append(
                ("params", f"{resolve_schema_name(names.params_schema_name)}Schema")
            )
        if names.query_schema_name and query_params:
            request_parts.append(("query", f"{resolve_schema_name(names.query_schema_name)}Schema"))
        if names.headers_schema_name and header_params:
            request_parts.append(
                ("headers", f"{resolve_schema_name(names.headers_schema_name)}Schema")
            )
        if names.body_schema_name and route.request_body is not None:
            request_parts.append(("body", f"{resolve_schema_name(names.body_schema_name)}Schema"))

        if request_parts:
            request_paths[route.path][route.method] = request_parts

        response_paths.setdefault(route.path, {})
        response_paths[route.path].setdefault(route.method, {})
        for status_code, response_schema in route.responses.items():
            if not response_schema:
                continue
            suffix = "Response" if status_code.startswith("2") else "ErrorResponse"
            response_schema_name = _generate_route_schema_name(
                route.path, route.method, f"{status_code}{suffix}"
            )
            response_paths[route.path][route.method][status_code] = (
                f"{resolve_schema_name(response_schema_name)}Schema"
            )

    lines.append("Request = {")
    for path, methods in request_paths.items():
        if not methods:
            continue
        method_entries = [(m, parts) for m, parts in methods.items() if parts]
        if not method_entries:
            continue
        lines.append(f"    {path!r}: {{")
        for method, parts in method_entries:
            lines.append(f"        {method!r}: {{")
            for key, schema in parts:
                lines.append(f"            {key!r}: {schema},")
            lines.append("        },")
        lines.append("    },")
    lines.append("}")
    lines.append("")

    lines.append("Response = {")
    for path, methods in response_paths.items():
        if not methods:
            continue
        lines.append(f"    {path!r}: {{")
        for method, status_codes in methods.items():
            lines.append(f"        {method!r}: {{")
            for status_code, schema_name in status_codes.items():
                lines.append(f"            {status_code!r}: {schema_name},")
            lines.append("        },")
        lines.append("    },")
    lines.append("}")

    return lines


def openapi_to_pydantic_code(
    openapi: dict[str, Any],
    custom_import_lines: list[str] | None = None,
    options: dict[str, Any] | None = None,
) -> str:
    components = openapi.get("components")
    schemas = {}
    if isinstance(components, dict):
        schemas = components.get("schemas") or {}
    if not isinstance(schemas, dict):
        schemas = {}

    lines: list[str] = []
    lines.append("# This file was automatically generated from OpenAPI schema")
    lines.append("# Do not manually edit this file")
    lines.append("from __future__ import annotations")
    lines.append("")
    lines.append("from typing import Any, Annotated, Literal, Optional, TypeAlias, Union")
    lines.append("from datetime import date, datetime")
    lines.append("from uuid import UUID")
    lines.append("")
    lines.append("from pydantic import BaseModel, ConfigDict, Field, RootModel, TypeAdapter")
    lines.append("from pydantic import AnyUrl, EmailStr")
    lines.append("from python_zod_openapi.all_of import all_of")
    lines.append("")
    if custom_import_lines:
        lines.extend(custom_import_lines)
        lines.append("")

    registry = create_schema_registry()

    for name in topological_sort_schemas(schemas):
        schema = schemas.get(name)
        if schema is None:
            continue
        lines.extend(_emit_schema_definition(name, schema))
        fingerprint = get_schema_fingerprint(schema)
        pre_register_schema(registry, name, fingerprint)

    include_routes = bool(options.get("include_routes") if options else False)
    if include_routes:
        routes = parse_openapi_paths(openapi)
        if routes:
            route_schema_list = _collect_route_schemas(routes)
            common_schemas = find_common_schemas(route_schema_list, 2)

            if common_schemas:
                lines.append("# Common Error Schemas (deduplicated)")
                for common in common_schemas:
                    if common.fingerprint in registry.fingerprint_to_name:
                        continue
                    lines.extend(_emit_schema_definition(common.name, common.schema))
                    pre_register_schema(registry, common.name, common.fingerprint)
                lines.append("")

            declarations, schema_name_to_canonical = _generate_route_schemas(routes, registry)
            if declarations:
                lines.append("# Route Schemas")
                lines.extend(declarations)
                lines.append("")
                lines.extend(_generate_request_response_objects(routes, schema_name_to_canonical))

    return "\n".join(lines)


def convert_schema_to_pydantic_string(schema: AnySchema | None) -> str:
    return _schema_to_type_expr(schema)

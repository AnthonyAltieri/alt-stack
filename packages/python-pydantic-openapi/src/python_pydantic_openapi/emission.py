from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .dependencies import topological_sort_schemas
from .lowering import LoweringContext, NamedSchema, lower_named_schema
from .rendering import (
    RenderContext,
    decode_component_ref,
    extra_field_annotation,
    is_object_model_schema,
    root_model_annotation,
    schema_to_type_expr,
)
from .routes import (
    RouteInfo,
    build_route_schema_name,
    generate_route_schema_names,
    parse_openapi_paths,
)
from .schema_dedup import (
    NamedSchema as DedupNamedSchema,
)
from .schema_dedup import (
    create_schema_registry,
    find_common_schemas,
    get_schema_fingerprint,
    pre_register_schema,
    register_schema,
)
from .types import AnySchema

_VALID_IDENTIFIER_CHARS = set("_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")


@dataclass(slots=True)
class EmissionState:
    render_context: RenderContext = field(default_factory=RenderContext)
    rebuild_names: list[str] = field(default_factory=list)


def openapi_to_pydantic_code(
    openapi: dict[str, Any],
    custom_import_lines: list[str] | None = None,
    options: dict[str, Any] | None = None,
) -> str:
    include_routes = bool(options.get("include_routes") if options else False)
    components = openapi.get("components")
    schemas = components.get("schemas") if isinstance(components, dict) else {}
    if not isinstance(schemas, dict):
        schemas = {}

    lowering_context = LoweringContext(set(schemas.keys()))
    lowered_components: list[NamedSchema] = []
    for name in topological_sort_schemas(schemas):
        schema = schemas.get(name)
        if schema is None:
            continue
        lowered_components.extend(lower_named_schema(lowering_context, name, schema))

    lines = _build_module_preamble(custom_import_lines)
    state = EmissionState()
    registry = create_schema_registry()

    for named_schema in lowered_components:
        lines.extend(_emit_named_schema(named_schema.name, named_schema.schema, state))
        pre_register_schema(
            registry,
            named_schema.name,
            get_schema_fingerprint(named_schema.schema),
        )

    if include_routes:
        routes = parse_openapi_paths(openapi)
        if routes:
            route_lines, schema_name_to_canonical = _emit_route_schemas(
                routes,
                lowering_context,
                registry,
                state,
            )
            if route_lines:
                lines.append("# Route Schemas")
                lines.extend(route_lines)
                lines.append("")

            lines.extend(_emit_model_rebuilds(state.rebuild_names))
            if route_lines:
                lines.append("")
            lines.extend(_generate_request_response_objects(routes, schema_name_to_canonical))
            return "\n".join(lines)

    lines.extend(_emit_model_rebuilds(state.rebuild_names))
    return "\n".join(lines)


def _build_module_preamble(custom_import_lines: list[str] | None) -> list[str]:
    lines = [
        "# This file was automatically generated from OpenAPI schema",
        "# Do not manually edit this file",
        "from __future__ import annotations",
        "",
        "from typing import Any, Annotated, Literal, Optional, Union",
        "from datetime import date, datetime",
        "from uuid import UUID",
        "",
        "from pydantic import BaseModel, ConfigDict, Field, RootModel",
        "from pydantic import AnyUrl, EmailStr",
        "from python_pydantic_openapi.all_of import all_of",
        "",
    ]
    if custom_import_lines:
        lines.extend(custom_import_lines)
        lines.append("")
    return lines


def _emit_named_schema(name: str, schema: AnySchema, state: EmissionState) -> list[str]:
    if is_object_model_schema(schema):
        return _emit_object_model(name, schema, state)
    return _emit_root_model(name, schema, state)


def _emit_object_model(name: str, schema: AnySchema, state: EmissionState) -> list[str]:
    all_of = schema.get("allOf") if isinstance(schema, dict) else None
    if isinstance(all_of, list):
        base_classes, merged_schema = _merge_allof_object_schema(all_of)
        model_lines = _build_model_lines(name, merged_schema, base_classes=base_classes or None)
        model_lines.insert(1, f"    __openapi_allof__ = {all_of!r}")
    else:
        model_lines = _build_model_lines(name, schema)

    state.rebuild_names.append(name)
    return [*model_lines, ""]


def _emit_root_model(name: str, schema: AnySchema, state: EmissionState) -> list[str]:
    state.render_context.root_model_names.add(name)
    type_expr = schema_to_type_expr(schema, context=state.render_context)
    state.rebuild_names.append(name)
    return [
        f"class {name}({root_model_annotation(type_expr)}):",
        "    pass",
        "",
    ]


def _merge_allof_object_schema(all_of: list[Any]) -> tuple[list[str], dict[str, Any]]:
    base_classes: list[str] = []
    inline_properties: dict[str, Any] = {}
    inline_required: list[str] = []
    additional_properties: Any = None

    for part in all_of:
        if not isinstance(part, dict):
            continue
        if isinstance(part.get("$ref"), str):
            base_classes.append(decode_component_ref(part["$ref"]))
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

            additional = part.get("additionalProperties")
            if additional is False:
                additional_properties = False
            elif isinstance(additional, dict):
                additional_properties = additional

    merged_schema: dict[str, Any] = {
        "type": "object",
        "properties": inline_properties,
        "required": inline_required,
    }
    if additional_properties is not None:
        merged_schema["additionalProperties"] = additional_properties
    return base_classes, merged_schema


def _build_model_lines(
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

            type_expr = schema_to_type_expr(prop_schema)
            is_required = prop_name in required
            if is_required:
                default_expr = f" = Field(alias={alias!r})" if alias else ""
            else:
                default_expr = (
                    f" = Field(default=None, alias={alias!r})" if alias else " = None"
                )

            field_lines.append(f"    {attr_name}: {type_expr}{default_expr}")

    config_args: list[str] = []
    extra_line: str | None = None
    if alias_used:
        config_args.append("populate_by_name=True")

    if additional is False:
        config_args.append("extra='forbid'")
    elif additional is True or additional is None:
        config_args.append("extra='allow'")
    elif isinstance(additional, dict):
        config_args.append("extra='allow'")
        extra_type = schema_to_type_expr(additional)
        extra_line = (
            f"    __pydantic_extra__: {extra_field_annotation(extra_type)} = Field(init=False)"
        )

    if config_args:
        lines.append(f"    model_config = ConfigDict({', '.join(config_args)})")
    if extra_line:
        lines.append(extra_line)

    if field_lines:
        lines.extend(field_lines)
    elif len(lines) == 1:
        lines.append("    pass")

    return lines


def _emit_model_rebuilds(names: list[str]) -> list[str]:
    if not names:
        return []
    return [*(f"{name}.model_rebuild()" for name in names), ""]


def _emit_route_schemas(
    routes: list[RouteInfo],
    lowering_context: LoweringContext,
    registry: Any,
    state: EmissionState,
) -> tuple[list[str], dict[str, str]]:
    lines: list[str] = []
    route_named_schemas: list[NamedSchema] = []

    schema_name_to_canonical: dict[str, str] = {}

    def register_named_schema_batch(named_schemas: list[NamedSchema]) -> None:
        local_canonical: dict[str, str] = {}
        for named_schema in named_schemas:
            canonical_schema = _rewrite_schema_refs(named_schema.schema, local_canonical)
            result = register_schema(registry, named_schema.name, canonical_schema)
            schema_name_to_canonical[named_schema.name] = result.canonical_name
            local_canonical[named_schema.name] = result.canonical_name
            if result.is_new:
                route_named_schemas.append(
                    NamedSchema(name=named_schema.name, schema=canonical_schema)
                )

    for common in find_common_schemas(_collect_route_schemas(routes), 2):
        if common.fingerprint in registry.fingerprint_to_name:
            continue
        register_named_schema_batch(
            lower_named_schema(lowering_context, common.name, common.schema)
        )

    def register_route_schema(name: str, schema: AnySchema) -> None:
        if _route_schema_ref_target(schema):
            return
        register_named_schema_batch(lower_named_schema(lowering_context, name, schema))

    for route in routes:
        names = generate_route_schema_names(route)
        path_params = [p for p in route.parameters if p.location == "path"]
        query_params = [p for p in route.parameters if p.location == "query"]
        header_params = [p for p in route.parameters if p.location == "header"]

        if names.params_schema_name and path_params:
            register_route_schema(
                names.params_schema_name,
                _build_openapi_object_schema(
                    [{"name": p.name, "schema": p.schema, "required": True} for p in path_params]
                ),
            )

        if names.query_schema_name and query_params:
            register_route_schema(
                names.query_schema_name,
                _build_openapi_object_schema(
                    [
                        {"name": p.name, "schema": p.schema, "required": p.required}
                        for p in query_params
                    ]
                ),
            )

        if names.headers_schema_name and header_params:
            register_route_schema(
                names.headers_schema_name,
                _build_openapi_object_schema(
                    [
                        {"name": p.name, "schema": p.schema, "required": p.required}
                        for p in header_params
                    ]
                ),
            )

        if names.body_schema_name and route.request_body is not None:
            register_route_schema(names.body_schema_name, route.request_body)

        for status_code, response_schema in route.responses.items():
            if not response_schema:
                continue
            suffix = "Response" if status_code.startswith("2") else "ErrorResponse"
            register_route_schema(
                build_route_schema_name(route.path, route.method, f"{status_code}{suffix}"),
                response_schema,
            )

    for named_schema in route_named_schemas:
        lines.extend(_emit_named_schema(named_schema.name, named_schema.schema, state))

    return lines, schema_name_to_canonical


def _collect_route_schemas(routes: list[RouteInfo]) -> list[DedupNamedSchema]:
    collected: list[DedupNamedSchema] = []
    for route in routes:
        for status_code, response_schema in route.responses.items():
            if not response_schema:
                continue
            suffix = "Response" if status_code.startswith("2") else "ErrorResponse"
            collected.append(
                {
                    "name": build_route_schema_name(
                        route.path,
                        route.method,
                        f"{status_code}{suffix}",
                    ),
                    "schema": response_schema,
                }
            )
    return collected


def _generate_request_response_objects(
    routes: list[RouteInfo],
    schema_name_to_canonical: dict[str, str],
) -> list[str]:
    lines: list[str] = []
    request_paths: dict[str, dict[str, list[tuple[str, str]]]] = {}
    response_paths: dict[str, dict[str, dict[str, str]]] = {}

    def resolve_schema_name(name: str, schema: AnySchema) -> str:
        ref_target = _route_schema_ref_target(schema)
        if ref_target:
            return ref_target
        return schema_name_to_canonical.get(name, name)

    for route in routes:
        names = generate_route_schema_names(route)
        path_params = [p for p in route.parameters if p.location == "path"]
        query_params = [p for p in route.parameters if p.location == "query"]
        header_params = [p for p in route.parameters if p.location == "header"]

        request_paths.setdefault(route.path, {})
        request_parts: list[tuple[str, str]] = []

        if names.params_schema_name and path_params:
            schema = _build_openapi_object_schema(
                [{"name": p.name, "schema": p.schema, "required": True} for p in path_params]
            )
            request_parts.append(("params", resolve_schema_name(names.params_schema_name, schema)))

        if names.query_schema_name and query_params:
            schema = _build_openapi_object_schema(
                [{"name": p.name, "schema": p.schema, "required": p.required} for p in query_params]
            )
            request_parts.append(("query", resolve_schema_name(names.query_schema_name, schema)))

        if names.headers_schema_name and header_params:
            schema = _build_openapi_object_schema(
                [
                    {"name": p.name, "schema": p.schema, "required": p.required}
                    for p in header_params
                ]
            )
            request_parts.append(
                (
                    "headers",
                    resolve_schema_name(names.headers_schema_name, schema),
                )
            )

        if names.body_schema_name and route.request_body is not None:
            request_parts.append(
                ("body", resolve_schema_name(names.body_schema_name, route.request_body))
            )

        if request_parts:
            request_paths[route.path][route.method] = request_parts

        response_paths.setdefault(route.path, {})
        response_paths[route.path].setdefault(route.method, {})
        for status_code, response_schema in route.responses.items():
            if not response_schema:
                continue
            suffix = "Response" if status_code.startswith("2") else "ErrorResponse"
            schema_name = build_route_schema_name(
                route.path,
                route.method,
                f"{status_code}{suffix}",
            )
            response_paths[route.path][route.method][status_code] = resolve_schema_name(
                schema_name,
                response_schema,
            )

    lines.append("Request = {")
    for path, methods in request_paths.items():
        lines.append(f"    {path!r}: {{")
        for method, parts in methods.items():
            lines.append(f"        {method!r}: {{")
            for key, model_name in parts:
                lines.append(f"            {key!r}: {model_name},")
            lines.append("        },")
        lines.append("    },")
    lines.append("}")
    lines.append("")
    lines.append("Response = {")
    for path, methods in response_paths.items():
        lines.append(f"    {path!r}: {{")
        for method, status_codes in methods.items():
            lines.append(f"        {method!r}: {{")
            for status_code, model_name in status_codes.items():
                lines.append(f"            {status_code!r}: {model_name},")
            lines.append("        },")
        lines.append("    },")
    lines.append("}")
    return lines


def _build_openapi_object_schema(params: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {param["name"]: param["schema"] for param in params},
        "required": [param["name"] for param in params if param.get("required")],
        "additionalProperties": False,
    }


def _route_schema_ref_target(schema: AnySchema) -> str | None:
    if not isinstance(schema, dict):
        return None
    ref = schema.get("$ref")
    if not isinstance(ref, str) or schema.get("nullable") is True:
        return None
    if set(schema.keys()) != {"$ref"}:
        return None
    return decode_component_ref(ref)


def _rewrite_schema_refs(schema: AnySchema, aliases: dict[str, str]) -> AnySchema:
    if not isinstance(schema, dict):
        return schema

    rewritten = dict(schema)
    ref = rewritten.get("$ref")
    if isinstance(ref, str):
        name = decode_component_ref(ref)
        canonical = aliases.get(name)
        if canonical and canonical != name:
            rewritten["$ref"] = f"#/components/schemas/{canonical}"

    for key, value in list(rewritten.items()):
        if isinstance(value, dict):
            rewritten[key] = _rewrite_schema_refs(value, aliases)
        elif isinstance(value, list):
            rewritten[key] = [
                _rewrite_schema_refs(item, aliases) if isinstance(item, dict) else item
                for item in value
            ]

    return rewritten


def _sanitize_identifier(name: str) -> str:
    result = "".join(ch if ch in _VALID_IDENTIFIER_CHARS else "_" for ch in name)
    if result and result[0].isupper() and result[1:].islower():
        result = result[0].lower() + result[1:]
    if not result or result[0].isdigit():
        result = f"_{result}"
    return f"{result}_" if result in {"class", "from", "global", "pass"} else result


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

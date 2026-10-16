from __future__ import annotations

import ast
import json
import keyword
import re
from dataclasses import replace
from typing import Callable

from .routes import RouteInfo, build_route_schema_name, generate_route_schema_names
from .types import AnySchema

_RESERVED = set(
    "Any Annotated BaseModel BeforeValidator ConfigDict Field Final JsonValue Literal NewType "
    "Optional Request Response RootModel TypeAdapter TypedDict UUID Union bool dict float int "
    "list str date datetime cast overload _client _JsonValue _json_value "
    "ApiClient HttpxApiClient".split()
)


def get_brand_name(schema: AnySchema) -> str | None:
    if not isinstance(schema, dict) or "x-altstack-brand" not in schema:
        return None
    name = schema["x-altstack-brand"]
    if (
        not isinstance(name, str)
        or re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name) is None
        or keyword.iskeyword(name)
        or name in _RESERVED
    ):
        raise ValueError(f"Invalid x-altstack-brand {name!r}: expected a non-reserved identifier")
    return name


def annotation_base(expr: str) -> str:
    node = ast.parse(expr, mode="eval").body
    if (
        isinstance(node, ast.Subscript)
        and isinstance(node.value, ast.Name)
        and node.value.id == "Annotated"
        and isinstance(node.slice, ast.Tuple)
    ):
        return ast.unparse(node.slice.elts[0])
    return expr


def branded_annotation(name: str, expr: str) -> str:
    """Retain validation metadata at each use while sharing the nominal type."""
    if newtype_base(expr) != annotation_base(expr):
        return f"Annotated[{name}, BeforeValidator(TypeAdapter({expr}).validate_python)]"
    if expr.startswith("Annotated["):
        base = ast.parse(expr, mode="eval").body
        assert isinstance(base, ast.Subscript) and isinstance(base.slice, ast.Tuple)
        end = base.slice.elts[0].end_col_offset
        return f"Annotated[{name}{expr[end:]}"
    return name


def newtype_base(expr: str) -> str:
    """NewType requires a class; preserve non-class validation at the use site."""
    base = annotation_base(expr)
    node = ast.parse(base, mode="eval").body
    if isinstance(node, ast.Name) and node.id not in {"Any", "_JsonValue"}:
        return base
    if isinstance(node, ast.Subscript) and isinstance(node.value, ast.Name):
        if node.value.id not in {"Union", "Optional", "Literal"}:
            return base
        if node.value.id == "Literal":
            values = node.slice.elts if isinstance(node.slice, ast.Tuple) else [node.slice]
            types = {type(ast.literal_eval(value)) for value in values}
            if len(types) == 1 and next(iter(types)) in {str, int, bool, float}:
                return next(iter(types)).__name__
    return "object"


def prepare_brand_schemas(
    schemas: dict[str, AnySchema],
    routes: list[RouteInfo],
    to_type: Callable[[AnySchema], str],
    needs_model: Callable[[AnySchema], bool],
) -> tuple[dict[str, AnySchema], list[RouteInfo]]:
    """Lower nominal aliases into the existing component dependency/emission path."""
    definitions: dict[str, AnySchema] = {}
    bases: dict[str, str] = {}
    route_names: set[str] = set()
    for route in routes:
        names = generate_route_schema_names(route)
        route_names.update(name for name in vars(names).values() if isinstance(name, str))
        for status in route.responses:
            suffix = "Response" if status.startswith("2") else "ErrorResponse"
            route_names.add(build_route_schema_name(route.path, route.method, f"{status}{suffix}"))

    def resolve_base(schema: AnySchema) -> AnySchema:
        base = {k: v for k, v in schema.items() if k not in {"x-altstack-brand", "nullable"}}
        seen: set[str] = set()
        while isinstance(base.get("$ref"), str):
            target = base["$ref"].removeprefix("#/components/schemas/")
            if target in seen or target not in schemas:
                break
            seen.add(target)
            base = {
                k: v
                for k, v in schemas[target].items()
                if k != "nullable" and not (k == "x-altstack-brand" and v == get_brand_name(schema))
            }
        return base

    def transform(schema: AnySchema) -> AnySchema:
        if not isinstance(schema, dict):
            return schema
        brand = get_brand_name(schema)
        ref = schema.get("$ref")
        target = ref.removeprefix("#/components/schemas/") if isinstance(ref, str) else None
        if not brand and target in schemas and get_brand_name(schemas[target]):
            return transform(
                {**schemas[target], **{k: v for k, v in schema.items() if k != "$ref"}}
            )
        if brand:
            if brand in route_names:
                raise ValueError(f"x-altstack-brand {brand!r} conflicts with a route model")
            base = resolve_base(schema)
            base_type = annotation_base(to_type(base))
            signature = f"{base_type}:{base.get('format', '')}"
            if needs_model(base):
                signature = json.dumps(base, sort_keys=True)
            if brand in bases and bases[brand] != signature:
                raise ValueError(f"Conflicting base types for x-altstack-brand {brand!r}")
            if brand in schemas and get_brand_name(schemas[brand]) != brand:
                raise ValueError(f"x-altstack-brand {brand!r} conflicts with component {brand}")
            bases[brand] = signature
            base = transform(base)
            if needs_model(base):
                base_name = f"{brand}Base"
                if base_name in schemas:
                    raise ValueError(
                        f"x-altstack-brand {brand!r} conflicts with component {base_name}"
                    )
                definitions[base_name] = base
                base = {"$ref": f"#/components/schemas/{base_name}"}
            definitions[brand] = {**base, "_altstack_newtype": True}
            result = {
                "$ref": f"#/components/schemas/{brand}",
                "_altstack_brand_schema": base,
            }
            if schema.get("nullable") is True:
                result["nullable"] = True
            return result

        result = dict(schema)
        properties = result.get("properties")
        if isinstance(properties, dict):
            result["properties"] = {name: transform(child) for name, child in properties.items()}
        for key in ("items", "additionalProperties"):
            if isinstance(result.get(key), dict):
                result[key] = transform(result[key])
        for key in ("oneOf", "anyOf", "allOf"):
            if isinstance(result.get(key), list):
                result[key] = [transform(child) for child in result[key]]
        return result

    transformed: dict[str, AnySchema] = {}
    for name, schema in schemas.items():
        output_name = f"{name}Model" if get_brand_name(schema) == name else name
        if output_name != name and output_name in schemas:
            raise ValueError(f"x-altstack-brand {name!r} conflicts with component {output_name}")
        transformed[output_name] = transform(schema)
    transformed_routes = [
        replace(
            route,
            parameters=[
                replace(param, schema=transform(param.schema)) for param in route.parameters
            ],
            request_body=transform(route.request_body) if route.request_body is not None else None,
            responses={status: transform(schema) for status, schema in route.responses.items()},
        )
        for route in routes
    ]
    conflicts = definitions.keys() & transformed.keys()
    if conflicts:
        raise ValueError(f"x-altstack-brand conflicts with generated model {min(conflicts)}")
    return {**definitions, **transformed}, transformed_routes

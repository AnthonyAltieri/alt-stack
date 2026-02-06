from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

from .types import AnySchema

HttpMethod = str


@dataclass
class RouteParameter:
    name: str
    location: str
    required: bool
    schema: AnySchema


@dataclass
class RouteInfo:
    path: str
    method: HttpMethod
    parameters: list[RouteParameter]
    request_body: AnySchema | None
    responses: dict[str, AnySchema]


@dataclass
class RouteSchemaNames:
    params_schema_name: str | None = None
    query_schema_name: str | None = None
    headers_schema_name: str | None = None
    body_schema_name: str | None = None
    response_schema_name: str | None = None


def _to_upper_method(method: str) -> HttpMethod:
    upper = method.upper()
    if upper in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
        return upper
    return "GET"


def _to_pascal_case(value: str) -> str:
    parts = [part for part in "".join(c if c.isalnum() else " " for c in value).split()]
    return "".join(part[:1].upper() + part[1:].lower() for part in parts)


def _generate_route_schema_name(path: str, method: HttpMethod, suffix: str) -> str:
    path_parts = []
    for part in path.split("/"):
        if not part:
            continue
        if part.startswith("{") and part.endswith("}"):
            path_parts.append(part[1:-1])
        else:
            path_parts.append(part)
    path_parts = [_to_pascal_case(part) for part in path_parts]
    method_prefix = method[:1] + method[1:].lower()
    return "".join([method_prefix, *path_parts, suffix])


def parse_openapi_paths(openapi: dict[str, Any]) -> list[RouteInfo]:
    paths_obj = openapi.get("paths")
    if not isinstance(paths_obj, dict):
        return []
    paths = cast(dict[str, Any], paths_obj)

    routes: list[RouteInfo] = []
    methods = ["get", "post", "put", "patch", "delete", "head", "options"]

    for path, path_item_obj in paths.items():
        if not isinstance(path_item_obj, dict):
            continue
        path_item = cast(dict[str, Any], path_item_obj)

        for method in methods:
            operation_obj = path_item.get(method)
            if not isinstance(operation_obj, dict):
                continue
            operation = cast(dict[str, Any], operation_obj)

            parameters: list[RouteParameter] = []
            responses: dict[str, AnySchema] = {}

            for params_src in (path_item.get("parameters"), operation.get("parameters")):
                if isinstance(params_src, list):
                    for param in params_src:
                        if isinstance(param, dict):
                            parameters.append(
                                RouteParameter(
                                    name=str(param.get("name", "")),
                                    location=str(param.get("in", "query")),
                                    required=bool(param.get("required")),
                                    schema=param.get("schema", {}),
                                )
                            )

            request_body = None
            rb = operation.get("requestBody")
            if isinstance(rb, dict):
                content = rb.get("content")
                if isinstance(content, dict):
                    json_content = content.get("application/json")
                    if isinstance(json_content, dict):
                        request_body = json_content.get("schema", {})

            responses_obj = operation.get("responses")
            if isinstance(responses_obj, dict):
                for status_code, response in responses_obj.items():
                    if not isinstance(response, dict):
                        continue
                    content = response.get("content")
                    if isinstance(content, dict):
                        json_content = content.get("application/json")
                        if isinstance(json_content, dict):
                            schema = json_content.get("schema")
                            if schema is not None:
                                responses[str(status_code)] = schema

            routes.append(
                RouteInfo(
                    path=str(path),
                    method=_to_upper_method(method),
                    parameters=parameters,
                    request_body=request_body,
                    responses=responses,
                )
            )

    return routes


def generate_route_schema_names(route: RouteInfo) -> RouteSchemaNames:
    path_params = [p for p in route.parameters if p.location == "path"]
    query_params = [p for p in route.parameters if p.location == "query"]
    header_params = [p for p in route.parameters if p.location == "header"]
    success_statuses = [status for status in route.responses if status.startswith("2")]

    result = RouteSchemaNames()
    if success_statuses:
        result.response_schema_name = _generate_route_schema_name(
            route.path,
            route.method,
            "Response",
        )

    if path_params:
        result.params_schema_name = _generate_route_schema_name(
            route.path,
            route.method,
            "Params",
        )

    if query_params:
        result.query_schema_name = _generate_route_schema_name(
            route.path,
            route.method,
            "Query",
        )

    if header_params:
        result.headers_schema_name = _generate_route_schema_name(
            route.path,
            route.method,
            "Headers",
        )

    if route.request_body is not None:
        result.body_schema_name = _generate_route_schema_name(
            route.path,
            route.method,
            "Body",
        )

    return result

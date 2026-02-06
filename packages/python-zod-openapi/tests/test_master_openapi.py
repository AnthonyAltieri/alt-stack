from __future__ import annotations

import importlib.util
import json
import types
from copy import deepcopy
from datetime import date, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Annotated, Any, Literal, Union, cast, get_args, get_origin
from uuid import UUID

import pytest
from pydantic import AnyUrl, BaseModel, EmailStr, TypeAdapter, ValidationError
from pydantic.fields import FieldInfo

from python_zod_openapi.registry import clear_pydantic_schema_registry
from python_zod_openapi.schema_dedup import get_schema_fingerprint
from python_zod_openapi.to_python import openapi_to_pydantic_code


def _load_fixture() -> dict[str, Any]:
    spec_path = Path(__file__).resolve().parents[2] / "openapi-test-spec" / "openapi.json"
    return json.loads(spec_path.read_text(encoding="utf-8"))


def _strip_examples(value: Any) -> Any:
    if isinstance(value, list):
        return [_strip_examples(item) for item in value]
    if isinstance(value, dict):
        result = {}
        for key, child in value.items():
            if key == "x-altstack-examples":
                continue
            result[key] = _strip_examples(child)
        return result
    return value


def _collect_component_refs(value: Any) -> set[str]:
    refs: set[str] = set()
    if isinstance(value, list):
        for item in value:
            refs.update(_collect_component_refs(item))
        return refs
    if isinstance(value, dict):
        ref = value.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/components/schemas/"):
            refs.add(ref.split("#/components/schemas/")[1])
        for child in value.values():
            refs.update(_collect_component_refs(child))
    return refs


def _load_module(code: str) -> types.ModuleType:
    with TemporaryDirectory() as tmp:
        path = Path(tmp) / "generated.py"
        path.write_text(code, encoding="utf-8")
        spec = importlib.util.spec_from_file_location("generated", path)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module


def _unwrap_annotated(tp: Any) -> tuple[Any, FieldInfo | None]:
    if get_origin(tp) is Annotated:
        args = get_args(tp)
        base = args[0]
        field_info = next((m for m in args[1:] if isinstance(m, FieldInfo)), None)
        return base, field_info
    return tp, None


def _unwrap_optional(tp: Any) -> tuple[Any, bool]:
    origin = get_origin(tp)
    if origin in {Union, types.UnionType}:
        args = list(get_args(tp))
        if type(None) in args:
            args = [arg for arg in args if arg is not type(None)]
            if len(args) == 1:
                return args[0], True
            return Union[tuple(args)], True
    return tp, False


def _apply_openapi_meta(schema: dict[str, Any], field_info: FieldInfo | None) -> None:
    if field_info is None:
        return
    extra_obj = field_info.json_schema_extra
    extra: dict[str, Any] = cast(dict[str, Any], extra_obj) if isinstance(extra_obj, dict) else {}
    openapi_meta = extra.get("openapi")
    if isinstance(openapi_meta, dict):
        schema.update(openapi_meta)
    if field_info.discriminator and "discriminator" not in schema:
        schema["discriminator"] = {"propertyName": field_info.discriminator}


def _to_openapi_schema(
    tp: Any,
    type_to_name: dict[Any, str],
    self_name: str | None = None,
    schema_fingerprint_to_name: dict[str, str] | None = None,
) -> dict[str, Any]:
    if isinstance(tp, TypeAdapter):
        tp = tp._type
    raw = tp

    base, field_info = _unwrap_annotated(raw)
    base, nullable = _unwrap_optional(base)
    if field_info is None:
        base, field_info = _unwrap_annotated(base)

    raw_name = type_to_name.get(raw)
    if raw_name and raw_name != self_name:
        schema = {"$ref": f"#/components/schemas/{raw_name}"}
        if nullable:
            schema["nullable"] = True
        return schema

    base_name = type_to_name.get(base)
    if base_name and base_name != self_name:
        schema = {"$ref": f"#/components/schemas/{base_name}"}
        if nullable:
            schema["nullable"] = True
        return schema

    schema: dict[str, Any]

    origin = get_origin(base)
    if origin is Literal:
        values = list(get_args(base))
        schema = {"enum": values}
        if all(isinstance(v, str) for v in values):
            schema["type"] = "string"
        elif all(isinstance(v, bool) for v in values):
            schema["type"] = "boolean"
        elif all(isinstance(v, int) for v in values):
            schema["type"] = "integer"
        elif all(isinstance(v, (int, float)) for v in values):
            schema["type"] = "number"
    elif origin in {Union, types.UnionType}:
        items = [_to_openapi_schema(item, type_to_name) for item in get_args(base)]
        schema = {"oneOf": items}
    elif origin is list:
        args = get_args(base)
        items = _to_openapi_schema(args[0], type_to_name) if args else {}
        schema = {"type": "array", "items": items}
    elif origin is dict:
        args = get_args(base)
        schema = {"type": "object"}
        if len(args) == 2 and args[1] is not Any:
            schema["additionalProperties"] = _to_openapi_schema(args[1], type_to_name)
    elif isinstance(base, type) and issubclass(base, BaseModel):
        if hasattr(base, "__openapi_allof__"):
            schema = {"allOf": list(base.__openapi_allof__)}
        else:
            properties: dict[str, Any] = {}
            required: list[str] = []
            for field_name, field in base.model_fields.items():
                prop_name = field.alias or field_name
                field_schema = _to_openapi_schema(
                    field.annotation,
                    type_to_name,
                    schema_fingerprint_to_name=schema_fingerprint_to_name,
                )
                if "$ref" not in field_schema:
                    extra = field.json_schema_extra or {}
                    openapi_meta = extra.get("openapi")
                    if isinstance(openapi_meta, dict):
                        field_schema.update(openapi_meta)
                    if field.discriminator and "discriminator" not in field_schema:
                        field_schema["discriminator"] = {"propertyName": field.discriminator}
                    if schema_fingerprint_to_name:
                        field_nullable = field_schema.get("nullable") is True
                        schema_for_match = dict(field_schema)
                        schema_for_match.pop("nullable", None)
                        match_name = schema_fingerprint_to_name.get(
                            get_schema_fingerprint(schema_for_match)
                        )
                        if match_name:
                            field_schema = {"$ref": f"#/components/schemas/{match_name}"}
                            if field_nullable:
                                field_schema["nullable"] = True
                properties[prop_name] = field_schema
                if field.is_required():
                    required.append(prop_name)
            schema = {"type": "object"}
            if properties:
                schema["properties"] = properties
            if required:
                schema["required"] = required
            if base.model_config.get("extra") == "forbid":
                schema["additionalProperties"] = False
    elif base is str:
        schema = {"type": "string"}
    elif base is int:
        schema = {"type": "integer"}
    elif base is float:
        schema = {"type": "number"}
    elif base is bool:
        schema = {"type": "boolean"}
    elif base is EmailStr:
        schema = {"type": "string", "format": "email"}
    elif base is AnyUrl:
        schema = {"type": "string", "format": "url"}
    elif base is UUID:
        schema = {"type": "string", "format": "uuid"}
    elif base is datetime:
        schema = {"type": "string", "format": "date-time"}
    elif base is date:
        schema = {"type": "string", "format": "date"}
    else:
        schema = {}

    _apply_openapi_meta(schema, field_info)

    if nullable:
        schema["nullable"] = True

    if schema_fingerprint_to_name and self_name is None:
        schema_for_match = dict(schema)
        schema_for_match.pop("nullable", None)
        fingerprint = get_schema_fingerprint(schema_for_match)
        match_name = schema_fingerprint_to_name.get(fingerprint)
        if match_name:
            ref_schema = {"$ref": f"#/components/schemas/{match_name}"}
            if nullable:
                ref_schema["nullable"] = True
            return ref_schema

    return schema


def test_master_openapi_fixture() -> None:
    clear_pydantic_schema_registry()
    spec = _load_fixture()
    code = openapi_to_pydantic_code(spec, options={"include_routes": True})
    module = _load_module(code)

    schemas = spec.get("components", {}).get("schemas", {})
    type_to_name = {getattr(module, name): name for name in schemas}

    for name, schema in schemas.items():
        examples = schema.get("x-altstack-examples")
        if not isinstance(examples, dict):
            continue
        adapter = getattr(module, f"{name}Schema")
        for value in examples.get("valid", []):
            adapter.validate_python(value)
        for value in examples.get("invalid", []):
            with pytest.raises(ValidationError):
                adapter.validate_python(value)

    expected = _strip_examples(spec)
    actual = deepcopy(expected)
    referenced_components = _collect_component_refs(expected)
    schema_fingerprint_to_name = {
        get_schema_fingerprint(schema): name
        for name, schema in expected.get("components", {}).get("schemas", {}).items()
        if name in referenced_components
    }

    for name in schemas:
        actual["components"]["schemas"][name] = _to_openapi_schema(
            getattr(module, name),
            type_to_name,
            self_name=name,
            schema_fingerprint_to_name=schema_fingerprint_to_name,
        )

    request_map = getattr(module, "Request", {})
    response_map = getattr(module, "Response", {})

    for path, path_item in actual.get("paths", {}).items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if method.lower() not in {
                "get",
                "post",
                "put",
                "patch",
                "delete",
                "head",
                "options",
            }:
                continue
            op = operation
            if not isinstance(op, dict):
                continue
            method_key = method.upper()
            request_entry = request_map.get(path, {}).get(method_key, {})
            response_entry = response_map.get(path, {}).get(method_key, {})

            if isinstance(op.get("parameters"), list):
                for param in op["parameters"]:
                    if not isinstance(param, dict):
                        continue
                    location = param.get("in")
                    name = param.get("name")
                    container = (
                        request_entry.get("params")
                        if location == "path"
                        else request_entry.get("query")
                        if location == "query"
                        else request_entry.get("headers")
                        if location == "header"
                        else None
                    )
                    if container is None:
                        continue
                    container_schema = _to_openapi_schema(
                        container._type,
                        type_to_name,
                    )
                    if (
                        isinstance(container_schema.get("properties"), dict)
                        and name in container_schema["properties"]
                    ):
                        param["schema"] = container_schema["properties"][name]

            request_body = op.get("requestBody")
            if isinstance(request_body, dict):
                content = request_body.get("content")
                if isinstance(content, dict):
                    json_content = content.get("application/json")
                    if isinstance(json_content, dict) and request_entry.get("body") is not None:
                        schema_obj = _to_openapi_schema(
                            request_entry["body"]._type,
                            type_to_name,
                            schema_fingerprint_to_name=schema_fingerprint_to_name,
                        )
                        json_content["schema"] = schema_obj

            responses = op.get("responses")
            if isinstance(responses, dict):
                for status, response in responses.items():
                    if not isinstance(response, dict):
                        continue
                    content = response.get("content")
                    if not isinstance(content, dict):
                        continue
                    json_content = content.get("application/json")
                    if not isinstance(json_content, dict):
                        continue
                    adapter = response_entry.get(str(status))
                    if adapter is None:
                        continue
                    json_content["schema"] = _to_openapi_schema(
                        adapter._type,
                        type_to_name,
                        schema_fingerprint_to_name=schema_fingerprint_to_name,
                    )

    assert actual == expected

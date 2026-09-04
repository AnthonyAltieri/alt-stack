"""End-to-end: generated ``HttpxApiClient`` / ``ApiClient`` over the runtime client package."""

from __future__ import annotations

import asyncio
import importlib.util
import json
import types
from collections import deque
from collections.abc import Awaitable
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, TypeVar

import httpx
import pytest
from alt_stack_http_client_httpx import (
    ApiFailure,
    ApiSuccess,
    HttpRequest,
    HttpResponse,
    HttpxApiClient,
)

from alt_stack_pydantic_openapi.registry import clear_pydantic_schema_registry
from alt_stack_pydantic_openapi.to_python import openapi_to_pydantic_code

T = TypeVar("T")

ITEMS_PATH = "/items"
ITEM_PATH = "/items/{itemId}"
PING_PATH = "/ping"

ITEM_ID = "3f0c6f55-0d2a-4d22-9d66-3e2a1f7f2b11"


def _json_content(schema: dict[str, Any]) -> dict[str, Any]:
    return {"content": {"application/json": {"schema": schema}}}


def _ref(name: str) -> dict[str, Any]:
    return {"$ref": f"#/components/schemas/{name}"}


CLIENT_FIXTURE: dict[str, Any] = {
    "components": {
        "schemas": {
            "Item": {
                "type": "object",
                "properties": {"id": {"type": "string"}, "name": {"type": "string"}},
                "required": ["id", "name"],
            },
            "CreateItem": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "Display-Name": {"type": "string"},
                },
                "required": ["name"],
                "additionalProperties": False,
            },
            "ApiError": {
                "type": "object",
                "properties": {"message": {"type": "string"}},
                "required": ["message"],
            },
        }
    },
    "paths": {
        ITEMS_PATH: {
            "post": {
                "requestBody": _json_content(_ref("CreateItem")),
                "responses": {
                    "201": _json_content(_ref("Item")),
                    "400": _json_content(_ref("ApiError")),
                },
            }
        },
        ITEM_PATH: {
            "parameters": [
                {
                    "name": "itemId",
                    "in": "path",
                    "required": True,
                    "schema": {"type": "string", "format": "uuid"},
                }
            ],
            "get": {
                "parameters": [
                    {
                        "name": "tags",
                        "in": "query",
                        "schema": {"type": "array", "items": {"type": "string"}},
                    },
                    {"name": "limit", "in": "query", "schema": {"type": "integer"}},
                    {"name": "archived", "in": "query", "schema": {"type": "boolean"}},
                ],
                "responses": {
                    "200": _json_content(_ref("Item")),
                    "404": _json_content(_ref("ApiError")),
                },
            },
            "delete": {"responses": {"204": {"description": "deleted"}}},
        },
        PING_PATH: {"get": {"responses": {"200": {"description": "pong"}}}},
    },
}


class FakeTransport:
    """Records requests and replays scripted responses or exceptions."""

    def __init__(self, *responses: HttpResponse | Exception) -> None:
        self.requests: list[HttpRequest] = []
        self._responses = deque(responses)

    async def send(self, request: HttpRequest) -> HttpResponse:
        self.requests.append(request)
        item = self._responses.popleft()
        if isinstance(item, Exception):
            raise item
        return item


def _ok(status: int, data: Any, reason: str = "OK") -> HttpResponse:
    return HttpResponse(status=status, reason=reason, data=data, raw="raw", headers={"x": "y"})


def run(awaitable: Awaitable[T]) -> T:
    return asyncio.run(_await(awaitable))


async def _await(awaitable: Awaitable[T]) -> T:
    return await awaitable


@pytest.fixture(scope="module")
def sdk() -> Any:
    clear_pydantic_schema_registry()
    code = openapi_to_pydantic_code(CLIENT_FIXTURE, options={"include_routes": True})
    with TemporaryDirectory() as tmp:
        path = Path(tmp) / "client_sdk.py"
        path.write_text(code, encoding="utf-8")
        spec = importlib.util.spec_from_file_location("client_sdk", path)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        yield module


def _client(sdk: types.ModuleType, transport: FakeTransport, **kwargs: Any) -> Any:
    return sdk.ApiClient(
        "https://api.example.test/",
        transport=transport,
        request_map=sdk.Request,
        response_map=sdk.Response,
        backoff=lambda attempt: 0.0,
        **kwargs,
    )


# ------------------------------------------------------------------------- end to end


def test_generated_client_end_to_end_over_httpx(sdk: types.ModuleType) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert json.loads(request.content) == {"name": "widget"}
        return httpx.Response(201, json={"id": ITEM_ID, "name": "widget"})

    async def scenario() -> Any:
        async with sdk.HttpxApiClient(
            "https://api.example.test",
            request_map=sdk.Request,
            response_map=sdk.Response,
            httpx_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        ) as client:
            return await client.post(ITEMS_PATH, body=sdk.CreateItem(name="widget"))

    result = run(scenario())

    assert isinstance(result, ApiSuccess)
    assert result.code == "201"
    assert result.body == sdk.Item(id=ITEM_ID, name="widget")


def test_runtime_httpx_client_works_without_generated_class(sdk: types.ModuleType) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"message": "missing"})

    async def scenario() -> Any:
        client = HttpxApiClient(
            "https://api.example.test",
            request_map=sdk.Request,
            response_map=sdk.Response,
            httpx_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
        try:
            return await client.request("GET", ITEM_PATH, params={"itemId": ITEM_ID})
        finally:
            await client.aclose()

    result = run(scenario())

    assert isinstance(result, ApiFailure)
    assert result.code == "404"
    assert result.error == sdk.ApiError(message="missing")

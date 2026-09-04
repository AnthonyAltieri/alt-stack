"""Runtime behavior of ``python_pydantic_openapi.client`` against generated route maps."""

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

from python_pydantic_openapi.client import (
    ApiFailure,
    ApiSuccess,
    ApiTimeoutError,
    ApiUnexpectedError,
    ApiValidationError,
    BaseApiClient,
    HttpRequest,
    HttpResponse,
    HttpxTransport,
    RequestOptions,
    RetryContext,
    UnexpectedApiClientError,
    ValidationErrorContext,
)
from python_pydantic_openapi.registry import clear_pydantic_schema_registry
from python_pydantic_openapi.to_python import openapi_to_pydantic_code

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
        backoff=lambda attempt: 0.0,
        **kwargs,
    )


# --------------------------------------------------------------------------- encoding


def test_get_encodes_path_params_query_and_headers(sdk: types.ModuleType) -> None:
    transport = FakeTransport(_ok(200, {"id": ITEM_ID, "name": "widget"}))
    client = _client(sdk, transport, headers={"Authorization": "Bearer t", "X-Drop": None})
    params = sdk.Request[ITEM_PATH]["GET"]["params"](itemId=ITEM_ID)
    query = sdk.Request[ITEM_PATH]["GET"]["query"](tags=["a b", "c"], limit=5, archived=False)

    result = run(
        client.get(
            ITEM_PATH,
            params=params,
            query=query,
            options=RequestOptions(headers={"X-Trace": 7}, timeout=2.5),
        )
    )

    sent = transport.requests[0]
    assert sent.method == "GET"
    assert sent.url == (
        f"https://api.example.test/items/{ITEM_ID}?tags=a+b&tags=c&limit=5&archived=false"
    )
    assert sent.body is None
    assert sent.timeout == 2.5
    assert sent.headers == {
        "Content-Type": "application/json",
        "Authorization": "Bearer t",
        "X-Trace": "7",
    }
    assert isinstance(result, ApiSuccess)
    assert result.code == "200"
    assert isinstance(result.body, sdk.Item)
    assert result.body.name == "widget"
    assert result.raw == "raw"
    assert result.headers == {"x": "y"}


def test_query_accepts_mapping_and_drops_unset_and_none(sdk: types.ModuleType) -> None:
    transport = FakeTransport(_ok(200, {"id": ITEM_ID, "name": "widget"}))
    client = _client(sdk, transport)

    run(client.get(ITEM_PATH, params={"itemId": ITEM_ID}, query={"limit": 1}))

    assert transport.requests[0].url.endswith(f"/items/{ITEM_ID}?limit=1")


def test_query_rejects_explicit_none_for_omittable_field(sdk: types.ModuleType) -> None:
    client = _client(sdk, FakeTransport())

    with pytest.raises(ApiValidationError, match="Query parameters validation failed"):
        run(client.get(ITEM_PATH, params={"itemId": ITEM_ID}, query={"tags": None}))


def test_path_params_are_url_encoded(sdk: types.ModuleType) -> None:
    transport = FakeTransport(_ok(204, None))
    client = BaseApiClient(
        "https://api.example.test",
        transport=transport,
        request_map={},
        response_map={},
    )

    run(client.request("GET", "/files/{name}", params={"name": "a/b c"}))

    assert transport.requests[0].url == "https://api.example.test/files/a%2Fb%20c"


def test_post_validates_and_serializes_body_by_alias(sdk: types.ModuleType) -> None:
    transport = FakeTransport(
        _ok(201, {"id": ITEM_ID, "name": "widget"}),
        _ok(201, {"id": ITEM_ID, "name": "widget"}),
    )
    client = _client(sdk, transport)
    create_item = sdk.Request[ITEMS_PATH]["POST"]["body"]

    run(client.post(ITEMS_PATH, body=create_item(name="widget", Display_Name="Widget")))
    run(client.post(ITEMS_PATH, body={"name": "gadget"}))

    first, second = transport.requests
    assert json.loads(first.body or "") == {"name": "widget", "Display-Name": "Widget"}
    assert json.loads(second.body or "") == {"name": "gadget"}
    assert first.method == "POST"


def test_delete_never_sends_a_body(sdk: types.ModuleType) -> None:
    transport = FakeTransport(_ok(204, None, reason="No Content"))
    client = _client(sdk, transport)

    result = run(
        client.request("DELETE", ITEM_PATH, params={"itemId": ITEM_ID}, body={"ignored": True})
    )

    assert transport.requests[0].body is None
    assert isinstance(result, ApiSuccess)
    assert result.code == "204"
    assert result.body is None


# ------------------------------------------------------------------------- validation


def test_invalid_params_raise_before_io_and_notify_handler(sdk: types.ModuleType) -> None:
    transport = FakeTransport()
    seen: list[ValidationErrorContext] = []
    client = _client(sdk, transport, on_validation_error=seen.append)

    with pytest.raises(ApiValidationError) as excinfo:
        run(client.get(ITEM_PATH, params={"itemId": "not-a-uuid"}))

    assert transport.requests == []
    assert excinfo.value.endpoint == ITEM_PATH
    assert excinfo.value.method == "GET"
    assert isinstance(excinfo.value.errors, list)
    assert [c.location for c in seen] == ["params"]
    assert seen[0].kind == "request"
    assert seen[0].data == {"itemId": "not-a-uuid"}


def test_invalid_body_raises_validation_error(sdk: types.ModuleType) -> None:
    transport = FakeTransport()
    client = _client(sdk, transport)

    with pytest.raises(ApiValidationError, match="Request body validation failed"):
        run(client.post(ITEMS_PATH, body={"name": "x", "unknown": 1}))

    assert transport.requests == []


def test_missing_path_params_without_schema_raise(sdk: types.ModuleType) -> None:
    transport = FakeTransport()
    client = BaseApiClient(
        "https://api.example.test", transport=transport, request_map={}, response_map={}
    )

    with pytest.raises(ApiValidationError, match="Missing required path parameters: id"):
        run(client.request("GET", "/things/{id}"))


def test_validation_handler_exceptions_are_swallowed(sdk: types.ModuleType) -> None:
    def explode(context: ValidationErrorContext) -> None:
        raise RuntimeError("boom")

    client = _client(sdk, FakeTransport(), on_validation_error=explode)

    with pytest.raises(ApiValidationError):
        run(client.get(ITEM_PATH, params={"itemId": "nope"}))


# -------------------------------------------------------------------------- responses


def test_documented_error_status_returns_failure_with_model(sdk: types.ModuleType) -> None:
    client = _client(sdk, FakeTransport(_ok(400, {"message": "bad"}, reason="Bad Request")))

    result = run(client.post(ITEMS_PATH, body={"name": "x"}))

    assert isinstance(result, ApiFailure)
    assert result.success is False
    assert result.code == "400"
    assert isinstance(result.error, sdk.ApiError)
    assert result.error.message == "bad"


def test_undocumented_error_status_returns_unexpected_error(sdk: types.ModuleType) -> None:
    client = _client(sdk, FakeTransport(_ok(503, "down", reason="Service Unavailable")))

    result = run(client.post(ITEMS_PATH, body={"name": "x"}))

    assert isinstance(result, ApiUnexpectedError)
    assert result.code == 503
    assert isinstance(result.error, UnexpectedApiClientError)
    assert result.error.code == 503
    assert result.error.cause == "down"
    assert result.error.endpoint == ITEMS_PATH


def test_undocumented_success_status_returns_raw_data(sdk: types.ModuleType) -> None:
    client = _client(sdk, FakeTransport(_ok(200, "pong")))

    result = run(client.get(PING_PATH))

    assert isinstance(result, ApiSuccess)
    assert result.code == "200"
    assert result.body == "pong"


def test_response_validation_failure_returns_unexpected_error(sdk: types.ModuleType) -> None:
    seen: list[ValidationErrorContext] = []
    client = _client(sdk, FakeTransport(_ok(201, {"id": 1})), on_validation_error=seen.append)

    result = run(client.post(ITEMS_PATH, body={"name": "x"}))

    assert isinstance(result, ApiUnexpectedError)
    assert result.code == 201
    assert "Response validation failed" in result.error.message
    assert [c.kind for c in seen] == ["response"]
    assert seen[0].location == "response"
    assert seen[0].status == 201
    assert seen[0].status_code == "201"
    assert seen[0].raw == "raw"


# ---------------------------------------------------------------------------- retries


def test_network_errors_are_retried_then_succeed(sdk: types.ModuleType) -> None:
    transport = FakeTransport(
        UnexpectedApiClientError("Network error"),
        _ok(200, "pong"),
    )
    client = _client(sdk, transport)

    result = run(client.get(PING_PATH, options=RequestOptions(retries=2)))

    assert isinstance(result, ApiSuccess)
    assert len(transport.requests) == 2


def test_client_errors_from_transport_are_not_retried(sdk: types.ModuleType) -> None:
    transport = FakeTransport(UnexpectedApiClientError("Forbidden", code=403), _ok(200, "pong"))
    client = _client(sdk, transport)

    with pytest.raises(UnexpectedApiClientError) as excinfo:
        run(client.get(PING_PATH, options=RequestOptions(retries=3)))

    assert excinfo.value.code == 403
    assert len(transport.requests) == 1


def test_exhausted_retries_raise_last_error(sdk: types.ModuleType) -> None:
    transport = FakeTransport(ApiTimeoutError(1.0), ApiTimeoutError(1.0))
    client = _client(sdk, transport)

    with pytest.raises(ApiTimeoutError):
        run(client.get(PING_PATH, options=RequestOptions(retries=1)))

    assert len(transport.requests) == 2


def test_should_retry_controls_response_and_error_retries(sdk: types.ModuleType) -> None:
    transport = FakeTransport(
        _ok(500, "oops", reason="Internal Server Error"),
        UnexpectedApiClientError("Network error"),
        _ok(200, "pong"),
    )
    contexts: list[RetryContext] = []

    def should_retry(context: RetryContext) -> bool:
        contexts.append(context)
        if context.response is not None:
            return context.response.status >= 500
        return True

    client = _client(sdk, transport)
    result = run(
        client.get(PING_PATH, options=RequestOptions(retries=5, should_retry=should_retry))
    )

    assert isinstance(result, ApiSuccess)
    assert len(transport.requests) == 3
    assert [c.attempt for c in contexts] == [0, 1, 2]
    assert contexts[0].response is not None and contexts[0].response.status == 500
    assert isinstance(contexts[1].error, UnexpectedApiClientError)
    assert contexts[2].response is not None and contexts[2].response.status == 200


def test_should_retry_false_stops_and_returns_last_response(sdk: types.ModuleType) -> None:
    transport = FakeTransport(
        _ok(500, "oops", reason="Internal Server Error"),
        _ok(500, "still", reason="Internal Server Error"),
    )
    client = _client(sdk, transport)

    result = run(
        client.get(
            PING_PATH,
            options=RequestOptions(retries=1, should_retry=lambda context: True),
        )
    )

    assert isinstance(result, ApiUnexpectedError)
    assert result.error.cause == "still"
    assert len(transport.requests) == 2


def test_should_retry_false_on_error_raises_immediately(sdk: types.ModuleType) -> None:
    transport = FakeTransport(UnexpectedApiClientError("Network error"), _ok(200, "pong"))
    client = _client(sdk, transport)

    with pytest.raises(UnexpectedApiClientError):
        run(
            client.get(
                PING_PATH,
                options=RequestOptions(retries=3, should_retry=lambda context: False),
            )
        )

    assert len(transport.requests) == 1


# ------------------------------------------------------------------------------ httpx


def _httpx_transport(handler: Any) -> HttpxTransport:
    return HttpxTransport(httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def test_httpx_transport_parses_json_text_and_empty_bodies() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/json":
            return httpx.Response(200, json={"ok": True})
        if request.url.path == "/text":
            return httpx.Response(200, text="plain")
        if request.url.path == "/bad-json":
            return httpx.Response(
                200, content=b"{oops", headers={"content-type": "application/json"}
            )
        return httpx.Response(204, headers={"content-length": "0"})

    async def scenario() -> list[HttpResponse]:
        async with _httpx_transport(handler) as transport:
            request = HttpRequest(
                method="POST",
                url="https://api.example.test/json",
                headers={"Content-Type": "application/json", "X-Trace": "1"},
                body='{"a":1}',
                timeout=3.0,
            )
            return [
                await transport.send(request),
                await transport.send(HttpRequest("GET", "https://api.example.test/text", {})),
                await transport.send(HttpRequest("GET", "https://api.example.test/bad-json", {})),
                await transport.send(HttpRequest("GET", "https://api.example.test/empty", {})),
            ]

    json_response, text_response, bad_json_response, empty_response = run(scenario())

    assert seen[0].method == "POST"
    assert seen[0].headers["x-trace"] == "1"
    assert seen[0].content == b'{"a":1}'
    assert seen[0].extensions["timeout"]["read"] == 3.0
    assert json_response.status == 200
    assert json_response.reason == "OK"
    assert json_response.data == {"ok": True}
    assert isinstance(json_response.raw, httpx.Response)
    assert json_response.headers["content-type"] == "application/json"
    assert text_response.data == "plain"
    assert bad_json_response.data == "{oops"
    assert empty_response.status == 204
    assert empty_response.data is None


def test_httpx_transport_maps_timeout_and_network_errors() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/slow":
            raise httpx.ReadTimeout("too slow", request=request)
        raise httpx.ConnectError("refused", request=request)

    async def scenario() -> tuple[ApiTimeoutError, UnexpectedApiClientError]:
        async with _httpx_transport(handler) as transport:
            with pytest.raises(ApiTimeoutError) as timeout_info:
                await transport.send(
                    HttpRequest("GET", "https://api.example.test/slow", {}, timeout=0.5)
                )
            with pytest.raises(UnexpectedApiClientError) as network_info:
                await transport.send(HttpRequest("GET", "https://api.example.test/down", {}))
            return timeout_info.value, network_info.value

    timeout_error, network_error = run(scenario())

    assert timeout_error.timeout == 0.5
    assert timeout_error.method == "GET"
    assert isinstance(timeout_error.cause, httpx.ReadTimeout)
    assert network_error.code is None
    assert "refused" in network_error.message


def test_generated_client_end_to_end_over_httpx(sdk: types.ModuleType) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert json.loads(request.content) == {"name": "widget"}
        return httpx.Response(201, json={"id": ITEM_ID, "name": "widget"})

    async def scenario() -> Any:
        async with _httpx_transport(handler) as transport:
            client = sdk.ApiClient("https://api.example.test", transport=transport)
            return await client.post(ITEMS_PATH, body=sdk.CreateItem(name="widget"))

    result = run(scenario())

    assert isinstance(result, ApiSuccess)
    assert result.code == "201"
    assert result.body == sdk.Item(id=ITEM_ID, name="widget")

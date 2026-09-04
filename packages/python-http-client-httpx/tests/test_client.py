"""Runtime behavior of ``alt_stack.http_client`` against hand-written route maps.

These tests do not depend on the generator: the models and ``Request`` / ``Response``
maps below have the same shape a generated SDK module produces.
"""

from __future__ import annotations

import asyncio
import json
from collections import deque
from collections.abc import Awaitable
from typing import Any, TypeVar
from uuid import UUID

import httpx
import pytest
from pydantic import BaseModel, ConfigDict, Field

from alt_stack.http_client import (
    ApiFailure,
    ApiSuccess,
    ApiTimeoutError,
    ApiUnexpectedError,
    ApiValidationError,
    BaseApiClient,
    HttpRequest,
    HttpResponse,
    HttpxApiClient,
    HttpxTransport,
    RequestOptions,
    RetryContext,
    UnexpectedApiClientError,
    ValidationErrorContext,
)

T = TypeVar("T")

ITEMS_PATH = "/items"
ITEM_PATH = "/items/{itemId}"
PING_PATH = "/ping"
ITEM_ID = "3f0c6f55-0d2a-4d22-9d66-3e2a1f7f2b11"


class Item(BaseModel):
    id: str
    name: str


class CreateItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")
    name: str
    tags: list[str] | None = None
    display_name: str | None = Field(default=None, alias="Display-Name")


class ApiError(BaseModel):
    message: str


class ItemParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    itemId: UUID


class ItemQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tags: list[str] | None = None
    limit: int | None = None
    archived: bool | None = None


REQUEST: dict[str, Any] = {
    ITEMS_PATH: {"POST": {"body": CreateItem}},
    ITEM_PATH: {
        "GET": {"params": ItemParams, "query": ItemQuery},
        "DELETE": {"params": ItemParams},
    },
    PING_PATH: {"GET": {}},
}
RESPONSE: dict[str, Any] = {
    ITEMS_PATH: {"POST": {"201": Item, "400": ApiError}},
    ITEM_PATH: {"GET": {"200": Item, "404": ApiError}, "DELETE": {}},
    PING_PATH: {"GET": {}},
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


def _client(transport: FakeTransport, **kwargs: Any) -> BaseApiClient:
    return BaseApiClient(
        "https://api.example.test/",
        transport=transport,
        request_map=REQUEST,
        response_map=RESPONSE,
        backoff=lambda attempt: 0.0,
        **kwargs,
    )


# --------------------------------------------------------------------------- encoding


def test_get_encodes_path_params_query_and_headers() -> None:
    transport = FakeTransport(_ok(200, {"id": ITEM_ID, "name": "widget"}))
    client = _client(transport, headers={"Authorization": "Bearer t", "X-Drop": None})

    result = run(
        client.request(
            "GET",
            ITEM_PATH,
            params=ItemParams(itemId=UUID(ITEM_ID)),
            query=ItemQuery(tags=["a b", "c"], limit=5, archived=False),
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
    assert result.body == Item(id=ITEM_ID, name="widget")
    assert result.raw == "raw"
    assert result.headers == {"x": "y"}


def test_query_accepts_mapping_and_drops_unset_and_none() -> None:
    transport = FakeTransport(
        _ok(200, {"id": ITEM_ID, "name": "widget"}),
        _ok(200, {"id": ITEM_ID, "name": "widget"}),
    )
    client = _client(transport)

    run(client.request("GET", ITEM_PATH, params={"itemId": ITEM_ID}, query={"limit": 1}))
    run(
        client.request(
            "GET", ITEM_PATH, params={"itemId": ITEM_ID}, query={"limit": 2, "tags": None}
        )
    )

    assert transport.requests[0].url.endswith(f"/items/{ITEM_ID}?limit=1")
    assert transport.requests[1].url.endswith(f"/items/{ITEM_ID}?limit=2")


def test_path_params_are_url_encoded() -> None:
    transport = FakeTransport(_ok(204, None))
    client = BaseApiClient(
        "https://api.example.test", transport=transport, request_map={}, response_map={}
    )

    run(client.request("GET", "/files/{name}", params={"name": "a/b c"}))

    assert transport.requests[0].url == "https://api.example.test/files/a%2Fb%20c"


def test_post_validates_and_serializes_body_by_alias() -> None:
    transport = FakeTransport(
        _ok(201, {"id": ITEM_ID, "name": "widget"}),
        _ok(201, {"id": ITEM_ID, "name": "widget"}),
    )
    client = _client(transport)

    run(client.request("POST", ITEMS_PATH, body=CreateItem(name="widget", display_name="Widget")))
    run(client.request("POST", ITEMS_PATH, body={"name": "gadget"}))

    first, second = transport.requests
    assert json.loads(first.body or "") == {"name": "widget", "Display-Name": "Widget"}
    assert json.loads(second.body or "") == {"name": "gadget"}
    assert first.method == "POST"


def test_delete_never_sends_a_body() -> None:
    transport = FakeTransport(_ok(204, None, reason="No Content"))
    client = _client(transport)

    result = run(
        client.request("DELETE", ITEM_PATH, params={"itemId": ITEM_ID}, body={"ignored": True})
    )

    assert transport.requests[0].body is None
    assert isinstance(result, ApiSuccess)
    assert result.code == "204"
    assert result.body is None


# ------------------------------------------------------------------------- validation


def test_invalid_params_raise_before_io_and_notify_handler() -> None:
    transport = FakeTransport()
    seen: list[ValidationErrorContext] = []
    client = _client(transport, on_validation_error=seen.append)

    with pytest.raises(ApiValidationError) as excinfo:
        run(client.request("GET", ITEM_PATH, params={"itemId": "not-a-uuid"}))

    assert transport.requests == []
    assert excinfo.value.endpoint == ITEM_PATH
    assert excinfo.value.method == "GET"
    assert isinstance(excinfo.value.errors, list)
    assert [c.location for c in seen] == ["params"]
    assert seen[0].kind == "request"
    assert seen[0].data == {"itemId": "not-a-uuid"}


def test_invalid_body_raises_validation_error() -> None:
    transport = FakeTransport()
    client = _client(transport)

    with pytest.raises(ApiValidationError, match="Request body validation failed"):
        run(client.request("POST", ITEMS_PATH, body={"name": "x", "unknown": 1}))

    assert transport.requests == []


def test_missing_path_params_without_schema_raise() -> None:
    client = BaseApiClient(
        "https://api.example.test", transport=FakeTransport(), request_map={}, response_map={}
    )

    with pytest.raises(ApiValidationError, match="Missing required path parameters: id"):
        run(client.request("GET", "/things/{id}"))


def test_validation_handler_exceptions_are_swallowed() -> None:
    def explode(context: ValidationErrorContext) -> None:
        raise RuntimeError("boom")

    client = _client(FakeTransport(), on_validation_error=explode)

    with pytest.raises(ApiValidationError):
        run(client.request("GET", ITEM_PATH, params={"itemId": "nope"}))


# -------------------------------------------------------------------------- responses


def test_documented_error_status_returns_failure_with_model() -> None:
    client = _client(FakeTransport(_ok(400, {"message": "bad"}, reason="Bad Request")))

    result = run(client.request("POST", ITEMS_PATH, body={"name": "x"}))

    assert isinstance(result, ApiFailure)
    assert result.success is False
    assert result.code == "400"
    assert result.error == ApiError(message="bad")


def test_undocumented_error_status_returns_unexpected_error() -> None:
    client = _client(FakeTransport(_ok(503, "down", reason="Service Unavailable")))

    result = run(client.request("POST", ITEMS_PATH, body={"name": "x"}))

    assert isinstance(result, ApiUnexpectedError)
    assert result.code == 503
    assert isinstance(result.error, UnexpectedApiClientError)
    assert result.error.code == 503
    assert result.error.cause == "down"
    assert result.error.endpoint == ITEMS_PATH


def test_undocumented_success_status_returns_raw_data() -> None:
    client = _client(FakeTransport(_ok(200, "pong")))

    result = run(client.request("GET", PING_PATH))

    assert isinstance(result, ApiSuccess)
    assert result.code == "200"
    assert result.body == "pong"


def test_response_validation_failure_returns_unexpected_error() -> None:
    seen: list[ValidationErrorContext] = []
    client = _client(FakeTransport(_ok(201, {"id": 1})), on_validation_error=seen.append)

    result = run(client.request("POST", ITEMS_PATH, body={"name": "x"}))

    assert isinstance(result, ApiUnexpectedError)
    assert result.code == 201
    assert "Response validation failed" in result.error.message
    assert [c.kind for c in seen] == ["response"]
    assert seen[0].location == "response"
    assert seen[0].status == 201
    assert seen[0].status_code == "201"
    assert seen[0].raw == "raw"


# ---------------------------------------------------------------------------- retries


def test_network_errors_are_retried_then_succeed() -> None:
    transport = FakeTransport(UnexpectedApiClientError("Network error"), _ok(200, "pong"))
    client = _client(transport)

    result = run(client.request("GET", PING_PATH, options=RequestOptions(retries=2)))

    assert isinstance(result, ApiSuccess)
    assert len(transport.requests) == 2


def test_client_errors_from_transport_are_not_retried() -> None:
    transport = FakeTransport(UnexpectedApiClientError("Forbidden", code=403), _ok(200, "pong"))
    client = _client(transport)

    with pytest.raises(UnexpectedApiClientError) as excinfo:
        run(client.request("GET", PING_PATH, options=RequestOptions(retries=3)))

    assert excinfo.value.code == 403
    assert len(transport.requests) == 1


def test_exhausted_retries_raise_last_error() -> None:
    transport = FakeTransport(ApiTimeoutError(1.0), ApiTimeoutError(1.0))
    client = _client(transport)

    with pytest.raises(ApiTimeoutError):
        run(client.request("GET", PING_PATH, options=RequestOptions(retries=1)))

    assert len(transport.requests) == 2


def test_should_retry_controls_response_and_error_retries() -> None:
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

    client = _client(transport)
    result = run(
        client.request(
            "GET", PING_PATH, options=RequestOptions(retries=5, should_retry=should_retry)
        )
    )

    assert isinstance(result, ApiSuccess)
    assert len(transport.requests) == 3
    assert [c.attempt for c in contexts] == [0, 1, 2]
    assert contexts[0].response is not None and contexts[0].response.status == 500
    assert isinstance(contexts[1].error, UnexpectedApiClientError)
    assert contexts[2].response is not None and contexts[2].response.status == 200


def test_should_retry_true_returns_last_response_when_exhausted() -> None:
    transport = FakeTransport(
        _ok(500, "oops", reason="Internal Server Error"),
        _ok(500, "still", reason="Internal Server Error"),
    )
    client = _client(transport)

    result = run(
        client.request(
            "GET",
            PING_PATH,
            options=RequestOptions(retries=1, should_retry=lambda context: True),
        )
    )

    assert isinstance(result, ApiUnexpectedError)
    assert result.error.cause == "still"
    assert len(transport.requests) == 2


def test_should_retry_false_on_error_raises_immediately() -> None:
    transport = FakeTransport(UnexpectedApiClientError("Network error"), _ok(200, "pong"))
    client = _client(transport)

    with pytest.raises(UnexpectedApiClientError):
        run(
            client.request(
                "GET",
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


def test_httpx_api_client_owns_its_transport() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert json.loads(request.content) == {"name": "widget"}
        return httpx.Response(201, json={"id": ITEM_ID, "name": "widget"})

    async def scenario() -> Any:
        async with HttpxApiClient(
            "https://api.example.test",
            request_map=REQUEST,
            response_map=RESPONSE,
            httpx_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        ) as client:
            return await client.request("POST", ITEMS_PATH, body=CreateItem(name="widget"))

    result = run(scenario())

    assert isinstance(result, ApiSuccess)
    assert result.code == "201"
    assert result.body == Item(id=ITEM_ID, name="widget")

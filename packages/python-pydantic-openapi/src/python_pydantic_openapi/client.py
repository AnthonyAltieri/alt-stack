"""Asyncio HTTP client for generated ``Request`` / ``Response`` route maps.

This is the Python counterpart of ``@alt-stack/http-client-core``. ``BaseApiClient``
validates and encodes request inputs with the Pydantic models found in the generated
``Request`` map, sends the request through a pluggable asyncio ``Transport``, and
validates the response body with the model found in the generated ``Response`` map.

Generated SDK modules subclass ``BaseApiClient`` as ``ApiClient`` and add one typed
method per HTTP verb whose ``Literal`` path overloads carry the exact request models and
``{Method}{Path}Result`` unions for each route.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any, Generic, Literal, Protocol, TypeVar
from urllib.parse import quote, urlencode

from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError
from pydantic_core import ErrorDetails

logger = logging.getLogger("python_pydantic_openapi.client")

HttpMethod = Literal["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
RouteMap = Mapping[str, Any]
"""``path -> METHOD -> request part or status code -> model class``.

Typed as ``Mapping[str, Any]`` because the generated maps are closed ``TypedDict``
shapes, which are not assignable to a nested ``Mapping`` type.
"""

_BODY_METHODS = frozenset({"POST", "PUT", "PATCH"})
_PATH_PARAM_PATTERN = re.compile(r"\{([^}]+)\}")
_MAX_BACKOFF_SECONDS = 30.0


# ============================================================================
# Transport
# ============================================================================


@dataclass(frozen=True, slots=True)
class HttpRequest:
    """Wire-level request handed to a ``Transport``."""

    method: str
    url: str
    headers: Mapping[str, str]
    body: str | None = None
    timeout: float | None = None
    """Timeout in seconds, or ``None`` for the transport default."""


@dataclass(frozen=True, slots=True)
class HttpResponse:
    """Wire-level response returned by a ``Transport``.

    ``data`` is the decoded body: parsed JSON when the response is JSON, text otherwise,
    ``None`` for an empty body. ``raw`` is the transport's native response object.
    """

    status: int
    reason: str
    data: Any
    raw: Any = None
    headers: Mapping[str, str] = field(default_factory=dict)


class Transport(Protocol):
    """Anything that can send an ``HttpRequest`` on the event loop."""

    async def send(self, request: HttpRequest) -> HttpResponse: ...


# ============================================================================
# Errors
# ============================================================================


class ApiClientError(Exception):
    """Base error for client failures."""

    def __init__(
        self,
        message: str,
        *,
        endpoint: str | None = None,
        method: str | None = None,
        cause: object = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.endpoint = endpoint
        self.method = method
        self.cause = cause


class UnexpectedApiClientError(ApiClientError):
    """Transport failure, undocumented error status, or unparseable response."""

    def __init__(
        self,
        message: str,
        *,
        code: int | None = None,
        endpoint: str | None = None,
        method: str | None = None,
        cause: object = None,
    ) -> None:
        super().__init__(message, endpoint=endpoint, method=method, cause=cause)
        self.code = code


class ApiValidationError(ApiClientError):
    """Request input did not satisfy the generated model for its route."""

    def __init__(
        self,
        message: str,
        errors: object,
        *,
        endpoint: str | None = None,
        method: str | None = None,
    ) -> None:
        super().__init__(message, endpoint=endpoint, method=method)
        self.errors = errors


class ApiTimeoutError(ApiClientError):
    """The transport did not complete within the requested timeout."""

    def __init__(
        self,
        timeout: float | None,
        *,
        endpoint: str | None = None,
        method: str | None = None,
        cause: object = None,
    ) -> None:
        super().__init__(
            f"Request timeout after {timeout}s", endpoint=endpoint, method=method, cause=cause
        )
        self.timeout = timeout


# ============================================================================
# Results
# ============================================================================

CodeT = TypeVar("CodeT", bound=str)
BodyT = TypeVar("BodyT")


@dataclass(frozen=True, slots=True)
class ApiSuccess(Generic[CodeT, BodyT]):
    """A 2xx response. ``body`` is the validated model when the status is documented."""

    code: CodeT
    body: BodyT
    raw: Any = None
    headers: Mapping[str, str] = field(default_factory=dict)
    success: Literal[True] = True


@dataclass(frozen=True, slots=True)
class ApiFailure(Generic[CodeT, BodyT]):
    """A documented non-2xx response with its validated error body."""

    code: CodeT
    error: BodyT
    raw: Any = None
    headers: Mapping[str, str] = field(default_factory=dict)
    success: Literal[False] = False


@dataclass(frozen=True, slots=True)
class ApiUnexpectedError:
    """A non-2xx status that is not documented, or a response that failed validation."""

    code: int
    error: UnexpectedApiClientError
    raw: Any = None
    headers: Mapping[str, str] = field(default_factory=dict)
    success: Literal[False] = False


ApiResult = ApiSuccess[str, Any] | ApiFailure[str, Any] | ApiUnexpectedError
"""Untyped result returned by ``BaseApiClient.request``."""


# ============================================================================
# Hooks and options
# ============================================================================

ValidationKind = Literal["request", "response"]
ValidationLocation = Literal["params", "query", "body", "response"]


@dataclass(frozen=True, slots=True)
class ValidationErrorContext:
    """Passed to ``on_validation_error`` whenever a Pydantic model rejects data."""

    kind: ValidationKind
    location: ValidationLocation
    endpoint: str
    method: str
    message: str
    data: Any
    errors: list[ErrorDetails]
    status: int | None = None
    status_code: str | None = None
    reason: str | None = None
    raw: Any = None


ValidationErrorHandler = Callable[[ValidationErrorContext], None]


@dataclass(frozen=True, slots=True)
class RetryContext:
    """Passed to ``should_retry``; exactly one of ``error`` / ``response`` is set."""

    attempt: int
    error: BaseException | None = None
    response: HttpResponse | None = None


ShouldRetry = Callable[[RetryContext], bool]
Backoff = Callable[[int], float]


def exponential_backoff(attempt: int, base_delay: float = 1.0) -> float:
    """Seconds to wait before retry ``attempt`` (0-indexed), capped at 30 seconds."""
    return min(base_delay * (2**attempt), _MAX_BACKOFF_SECONDS)


@dataclass(frozen=True, slots=True)
class RequestOptions:
    """Per-call transport options; route inputs are separate keyword arguments."""

    headers: Mapping[str, Any] | None = None
    timeout: float | None = None
    retries: int = 0
    should_retry: ShouldRetry | None = None


# ============================================================================
# Client
# ============================================================================


class BaseApiClient:
    """Transport-agnostic client over generated ``Request`` / ``Response`` maps.

    Use the generated ``ApiClient`` subclass for per-route static typing; use this class
    directly when you only have the maps and want runtime validation.
    """

    def __init__(
        self,
        base_url: str,
        *,
        transport: Transport,
        request_map: RouteMap,
        response_map: RouteMap,
        headers: Mapping[str, Any] | None = None,
        on_validation_error: ValidationErrorHandler | None = None,
        backoff: Backoff = exponential_backoff,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.transport = transport
        self.request_map = request_map
        self.response_map = response_map
        self.headers = dict(headers or {})
        self.on_validation_error = on_validation_error
        self.backoff = backoff

    async def request(
        self,
        method: str,
        path: str,
        *,
        params: object = None,
        query: object = None,
        body: object = None,
        options: RequestOptions | None = None,
    ) -> ApiResult:
        """Validate inputs, send the request with retries, and classify the response.

        Raises ``ApiValidationError`` for invalid inputs before any I/O. Transport errors
        propagate once retries are exhausted.
        """
        opts = options or RequestOptions()
        method = method.upper()
        route = _route_entry(self.request_map, path, method)

        wire_params = self._encode_params(path, method, route.get("params"), params)
        wire_query = self._encode_query(path, method, route.get("query"), query)
        wire_body = (
            None if body is None else self._encode_body(path, method, route.get("body"), body)
        )

        url = self.base_url + _interpolate_path(path, wire_params) + _build_query_string(wire_query)
        headers = _build_headers(self.headers, opts.headers)
        body_text = (
            json.dumps(wire_body) if wire_body is not None and method in _BODY_METHODS else None
        )
        http_request = HttpRequest(
            method=method, url=url, headers=headers, body=body_text, timeout=opts.timeout
        )

        response = await self._send_with_retries(http_request, path, opts)
        return self._classify_response(response, path, method)

    # ------------------------------------------------------------------ sending

    async def _send_with_retries(
        self, http_request: HttpRequest, endpoint: str, opts: RequestOptions
    ) -> HttpResponse:
        method = http_request.method
        last_error: BaseException | None = None
        last_response: HttpResponse | None = None
        attempt = 0

        while attempt <= opts.retries:
            try:
                response = await self.transport.send(http_request)
            except ApiValidationError:
                raise
            except Exception as error:  # noqa: BLE001 - transport errors are classified below
                last_error = error
                if attempt >= opts.retries:
                    break
                if opts.should_retry is not None:
                    if not opts.should_retry(RetryContext(attempt=attempt, error=error)):
                        break
                elif _is_client_error(error):
                    logger.error(
                        "HTTP request failed with non-retriable status: %s %s", method, endpoint
                    )
                    raise
                logger.warning(
                    "HTTP retrying after error: %s %s attempt=%d retries=%d error=%r",
                    method,
                    endpoint,
                    attempt,
                    opts.retries,
                    error,
                )
                await asyncio.sleep(self.backoff(attempt))
                attempt += 1
                continue

            if (
                opts.should_retry is not None
                and attempt < opts.retries
                and opts.should_retry(RetryContext(attempt=attempt, response=response))
            ):
                logger.warning(
                    "HTTP retry requested (response): %s %s status=%d attempt=%d retries=%d",
                    method,
                    endpoint,
                    response.status,
                    attempt,
                    opts.retries,
                )
                last_response = response
                await asyncio.sleep(self.backoff(attempt))
                attempt += 1
                continue

            return response

        if last_response is not None:
            return last_response

        logger.error(
            "HTTP request failed after retries: %s %s attempts=%d error=%r",
            method,
            endpoint,
            attempt,
            last_error,
        )
        if last_error is not None:
            raise last_error
        raise UnexpectedApiClientError(
            "Request failed after retries", endpoint=endpoint, method=method
        )

    # --------------------------------------------------------------- encoding

    def _encode_params(
        self, endpoint: str, method: str, model: type[BaseModel] | None, params: object
    ) -> dict[str, Any]:
        if model is not None:
            return self._validate_and_encode(
                model,
                {} if params is None else params,
                "Path parameters validation failed",
                endpoint,
                method,
                "params",
            )

        provided = _to_mapping(params)
        missing = [name for name in _PATH_PARAM_PATTERN.findall(endpoint) if name not in provided]
        if missing:
            logger.error(
                "HTTP request validation failed: %s %s missing=%s", method, endpoint, missing
            )
            raise ApiValidationError(
                f"Missing required path parameters: {', '.join(missing)}",
                {"missing": missing},
                endpoint=endpoint,
                method=method,
            )
        return dict(provided)

    def _encode_query(
        self, endpoint: str, method: str, model: type[BaseModel] | None, query: object
    ) -> dict[str, Any]:
        if model is None:
            return dict(_to_mapping(query))
        return self._validate_and_encode(
            model,
            {} if query is None else query,
            "Query parameters validation failed",
            endpoint,
            method,
            "query",
        )

    def _encode_body(
        self, endpoint: str, method: str, model: type[BaseModel] | None, body: object
    ) -> Any:
        if model is None:
            return (
                body.model_dump(mode="json", by_alias=True) if isinstance(body, BaseModel) else body
            )
        return self._validate_and_encode(
            model, body, "Request body validation failed", endpoint, method, "body"
        )

    def _validate_and_encode(
        self,
        model: type[BaseModel],
        data: object,
        message: str,
        endpoint: str,
        method: str,
        location: ValidationLocation,
    ) -> Any:
        try:
            parsed = data if isinstance(data, model) else model.model_validate(data)
        except PydanticValidationError as error:
            self._report_validation_error(
                ValidationErrorContext(
                    kind="request",
                    location=location,
                    endpoint=endpoint,
                    method=method,
                    message=message,
                    data=data,
                    errors=error.errors(),
                )
            )
            raise ApiValidationError(
                message, error.errors(), endpoint=endpoint, method=method
            ) from error
        return parsed.model_dump(mode="json", by_alias=True, exclude_unset=True)

    # --------------------------------------------------------------- responses

    def _classify_response(self, response: HttpResponse, endpoint: str, method: str) -> ApiResult:
        status_code = str(response.status)
        is_success = status_code.startswith("2")
        model = _route_entry(self.response_map, endpoint, method).get(status_code)

        if model is None:
            if is_success:
                return ApiSuccess(
                    code=status_code,
                    body=response.data,
                    raw=response.raw,
                    headers=response.headers,
                )
            logger.error(
                "HTTP error response: %s %s status=%d %s",
                method,
                endpoint,
                response.status,
                response.reason,
            )
            return ApiUnexpectedError(
                code=response.status,
                error=UnexpectedApiClientError(
                    f"Unexpected error response: {response.reason}",
                    code=response.status,
                    endpoint=endpoint,
                    method=method,
                    cause=response.data,
                ),
                raw=response.raw,
                headers=response.headers,
            )

        try:
            validated = model.model_validate(response.data)
        except PydanticValidationError as error:
            message = f"Response validation failed for {status_code}"
            self._report_validation_error(
                ValidationErrorContext(
                    kind="response",
                    location="response",
                    endpoint=endpoint,
                    method=method,
                    message=message,
                    data=response.data,
                    errors=error.errors(),
                    status=response.status,
                    status_code=status_code,
                    reason=response.reason,
                    raw=response.raw,
                )
            )
            return ApiUnexpectedError(
                code=response.status,
                error=UnexpectedApiClientError(
                    f"Response validation failed: {response.reason}",
                    code=response.status,
                    endpoint=endpoint,
                    method=method,
                    cause=response.data,
                ),
                raw=response.raw,
                headers=response.headers,
            )

        if is_success:
            return ApiSuccess(
                code=status_code, body=validated, raw=response.raw, headers=response.headers
            )
        logger.error(
            "HTTP error response: %s %s status=%d %s",
            method,
            endpoint,
            response.status,
            response.reason,
        )
        return ApiFailure(
            code=status_code, error=validated, raw=response.raw, headers=response.headers
        )

    def _report_validation_error(self, context: ValidationErrorContext) -> None:
        logger.error(
            "HTTP validation failed: kind=%s location=%s %s %s status=%s %s",
            context.kind,
            context.location,
            context.method,
            context.endpoint,
            context.status,
            context.message,
        )
        if self.on_validation_error is None:
            return
        try:
            self.on_validation_error(context)
        except Exception:  # noqa: BLE001 - observer callbacks never affect control flow
            logger.exception("on_validation_error handler raised")


# ============================================================================
# Helpers
# ============================================================================


def _route_entry(route_map: RouteMap, path: str, method: str) -> Mapping[str, type[BaseModel]]:
    methods = route_map.get(path)
    entry = methods.get(method) if isinstance(methods, Mapping) else None
    return entry if isinstance(entry, Mapping) else {}


def _to_mapping(value: object) -> Mapping[str, Any]:
    if value is None:
        return {}
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json", by_alias=True, exclude_unset=True)
    if isinstance(value, Mapping):
        return value
    raise TypeError(f"Expected a mapping or Pydantic model, got {type(value).__name__}")


def _is_client_error(error: BaseException) -> bool:
    return (
        isinstance(error, UnexpectedApiClientError)
        and error.code is not None
        and 400 <= error.code < 500
    )


def _interpolate_path(endpoint: str, params: Mapping[str, Any]) -> str:
    result = endpoint
    for key, value in params.items():
        result = result.replace(f"{{{key}}}", quote(_to_wire_string(value), safe=""))
    return result


def _build_query_string(query: Mapping[str, Any]) -> str:
    pairs: list[tuple[str, str]] = []
    for key, value in query.items():
        if value is None:
            continue
        if isinstance(value, (list, tuple)):
            pairs.extend((key, _to_wire_string(item)) for item in value if item is not None)
        else:
            pairs.append((key, _to_wire_string(value)))
    encoded = urlencode(pairs)
    return f"?{encoded}" if encoded else ""


def _build_headers(
    client_headers: Mapping[str, Any], request_headers: Mapping[str, Any] | None
) -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    for header_set in (client_headers, request_headers or {}):
        for key, value in header_set.items():
            if value is not None:
                headers[key] = _to_wire_string(value)
    return headers


def _to_wire_string(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return str(value)


# ============================================================================
# httpx transport (optional extra: python-pydantic-openapi[httpx])
# ============================================================================


class HttpxTransport:
    """``Transport`` backed by ``httpx.AsyncClient``.

    Requires the ``httpx`` extra. Pass an existing ``httpx.AsyncClient`` to share
    connection pools or configure defaults; otherwise one is created and owned here.
    """

    def __init__(self, client: Any = None) -> None:
        try:
            import httpx
        except ImportError as error:  # pragma: no cover - exercised only without the extra
            raise ImportError(
                "HttpxTransport requires httpx; install python-pydantic-openapi[httpx]"
            ) from error
        self._httpx = httpx
        self._owns_client = client is None
        self._client = client if client is not None else httpx.AsyncClient()

    async def send(self, request: HttpRequest) -> HttpResponse:
        httpx = self._httpx
        timeout = request.timeout if request.timeout is not None else httpx.USE_CLIENT_DEFAULT
        try:
            response = await self._client.request(
                request.method,
                request.url,
                headers=dict(request.headers),
                content=request.body,
                timeout=timeout,
            )
        except httpx.TimeoutException as error:
            raise ApiTimeoutError(
                request.timeout, endpoint=request.url, method=request.method, cause=error
            ) from error
        except httpx.HTTPError as error:
            raise UnexpectedApiClientError(
                f"Network error: {error}", endpoint=request.url, method=request.method, cause=error
            ) from error

        return HttpResponse(
            status=response.status_code,
            reason=response.reason_phrase,
            data=_parse_response_data(response),
            raw=response,
            headers=dict(response.headers),
        )

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def __aenter__(self) -> HttpxTransport:
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.aclose()


def _parse_response_data(response: Any) -> Any:
    if response.headers.get("content-length", "").strip() == "0":
        return None
    content_type = response.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            return response.json()
        except ValueError:
            return response.text
    return response.text


__all__ = [
    "ApiClientError",
    "ApiFailure",
    "ApiResult",
    "ApiSuccess",
    "ApiTimeoutError",
    "ApiUnexpectedError",
    "ApiValidationError",
    "Backoff",
    "BaseApiClient",
    "HttpMethod",
    "HttpRequest",
    "HttpResponse",
    "HttpxTransport",
    "RequestOptions",
    "RetryContext",
    "RouteMap",
    "ShouldRetry",
    "Transport",
    "UnexpectedApiClientError",
    "ValidationErrorContext",
    "ValidationErrorHandler",
    "exponential_backoff",
]

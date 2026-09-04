# Python/Pydantic OpenAPI API Documentation

`python-pydantic-openapi` converts OpenAPI JSON into Python 3.11+ source using Pydantic 2.7+.

```bash
python -m pip install python-pydantic-openapi
```

The installed distribution includes a `py.typed` marker. Every generated module imports `python_pydantic_openapi.all_of` in its fixed preamble, so the generator package remains a runtime dependency of generated code even when the input has no `allOf` expression.

## CLI: `python-pydantic-openapi`

```text
python-pydantic-openapi <input> [options]
```

| Argument/flag | Meaning |
| --- | --- |
| `input` | Required JSON file path or `http://`/`https://` URL. |
| `-o, --output <file>` | Output path; defaults to `generated-types.py`. Parent directories are not created. |
| `-r, --registry <file>` | Executes a Python registry file with `runpy.run_path`. |
| `-i, --include <file>` | Inserts the complete UTF-8 file contents after generated imports. |
| `-h, --help` | Standard argparse help. |

Local and URL bodies are parsed as JSON; YAML is not supported. URL loading uses `urllib.request.urlopen` without generator-specific headers or timeout options. The CLI always enables routes. Any exception prints `Error: ...` to stderr and exits 1; argparse usage errors exit through argparse.

The configurable long flag names are `--output`, `--registry`, and `--include`.

## `openapi_to_pydantic_code`

```python
def openapi_to_pydantic_code(
    openapi: dict[str, Any],
    custom_import_lines: list[str] | None = None,
    options: dict[str, Any] | None = None,
) -> str: ...
```

Returns Python source without writing it. The only consumed option is truthy `options["include_routes"]`; unknown option keys are ignored. Custom lines are inserted verbatim after the fixed imports.

Generation topologically orders component schemas and hoists inline object shapes into deterministic named models. Objects become `BaseModel` subclasses; non-object roots become `RootModel[...]`. Every named class receives a `model_rebuild()` call so forward references can resolve.

Object behavior:

- properties in `required` have no default;
- other properties are `Optional[...] = None`;
- renamed/invalid Python identifiers use `Field(alias=...)` and `populate_by_name=True`;
- `additionalProperties: false` uses `ConfigDict(extra='forbid')`;
- absent or `true` additional properties use `extra='allow'`;
- a schema-valued `additionalProperties` adds a typed `__pydantic_extra__` field.

When routes are enabled, the output contains route model classes plus `Request` and `Response` dictionaries, each declared with a closed `TypedDict` shape so literal indexing resolves to the exact model class. Bare request methods with no params/query/headers/body appear as `{}` in `Request`, matching the TypeScript generator. JSON response schemas are keyed by their string status.

## Schema conversion

The public entry point does not export the lower-level `convert_schema_to_pydantic_string`; schema conversion is part of `openapi_to_pydantic_code`. Generated mappings include:

| OpenAPI shape | Python/Pydantic output |
| --- | --- |
| local `$ref` | referenced model name, URI-decoded |
| `oneOf` / `anyOf` | `Union[...]`; discriminator becomes `Field(discriminator=...)` |
| `allOf` non-object | `all_of(...)` annotated validator |
| `allOf` objects/refs | model inheritance plus merged inline fields |
| string enum / numeric enum | `Literal[...]` |
| email | `EmailStr` |
| URL/URI | `AnyUrl` |
| UUID | `UUID` |
| other string | strict `str` with length/pattern fields where present |
| number/integer | strict `float`/`int` with `ge`/`le` |
| boolean | strict `bool` |
| array | `list[...]` with length constraints |
| nullable | `Optional[...]` |
| unknown | `Any` |

Date and date-time formats remain constrained strings unless a custom registry maps them to another exported type. Constraint and format details are also placed under `json_schema_extra={"openapi": ...}` where implemented.

Only inline parameters and `application/json` request/response schemas are used for routes. General reference resolution and external documents are not implemented.

## Registry exports

### `SUPPORTED_STRING_FORMATS`

The mutable list contains `color-hex`, `date`, `date-time`, `email`, `iso-date`, `iso-date-time`, `objectid`, `uri`, `url`, and `uuid`. Registration rejects other string formats.

### `register_pydantic_type_to_openapi_schema`

```python
def register_pydantic_type_to_openapi_schema(
    schema: Any,
    registration: PydanticOpenApiRegistration,
) -> None: ...
```

The registration dictionary has one of these shapes:

```python
{
    "schema_exported_variable_name": str,
    "type": "string",
    "format": <supported format>,       # or "formats": [<supported formats>]
    "description": str | None,
}

{
    "schema_exported_variable_name": str,
    "type": "number" | "integer" | "boolean",
    "description": str | None,
}
```

The internal TypedDict declarations treat `description` as a required key whose value may be `None`, so include it in statically checked registry files.

Duplicate format/type mappings to a different exported name raise `ValueError`; re-registering the same name is allowed. The registry also records `id(schema)` for `is_registered`, so registration identity is process-local.

### Lookups and clearing

- `get_schema_exported_variable_name_for_string_format(format_value)` returns a mapped name or `None`; unsupported format strings always return `None`.
- `get_schema_exported_variable_name_for_primitive_type(type_value)` looks up `number`, `integer`, or `boolean`.
- `clear_pydantic_schema_registry()` clears format, primitive, and schema-identity maps.
- `schema_registry` is the global registry object. Its public methods are `register`, `clear`, both lookup methods, and `is_registered`.

Registry mappings persist across generations in one interpreter. Clear them between independent jobs or tests. The exported name must exist in the generated module through `custom_import_lines` or an equivalent declaration.

## Generated route shape

For a JSON route, leaves of `Request` and `Response` are classes, not instances:

```python
params_class = Request["/users/{id}"]["GET"]["params"]
params = params_class.model_validate({"id": "u_1"})

body_class = Response["/users/{id}"]["GET"]["200"]
user = body_class.model_validate({"id": "u_1", "name": "Ada"})
```

Path parameters are forced required when route models are built. Query and header required flags follow the document. Response and structurally identical route models are deduplicated to a canonical class.

### Route-level type inference

`Request` and `Response` are plain dictionaries at runtime, but they are annotated with generated `TypedDict` declarations (one per path, method, and leaf) and marked `Final`. This is the Python counterpart of the TypeScript generator's `as const` maps: a type checker such as `ty`, Pyrefly, mypy, or Pyright resolves every literal lookup to the exact model class and rejects keys that are absent from the OpenAPI document.

```python
from typing import assert_type

from generated_types import CreateUserBody, Request, Response, User

assert_type(Request["/users"]["POST"]["body"], type[CreateUserBody])
assert_type(Response["/users/{id}"]["GET"]["200"], type[User])

user = Response["/users/{id}"]["GET"]["200"].model_validate(raw)
user.name  # inferred: str

Request["/not-a-route"]                # error: unknown path
Request["/users"]["GET"]               # error: method has no request entry
Request["/users"]["POST"]["query"]     # error: route has no query parameters
Response["/users/{id}"]["GET"]["999"]  # error: undocumented status code
```

The generated `TypedDict` names are private (`_PostUsersRequest`, `_UsersRequestMethods`, `_RequestMap`, and so on) and are an implementation detail; index `Request` and `Response` directly.

## Generated `ApiClient`

When routes are enabled, the module also emits two asyncio client classes and one `{Method}{Path}Result` union per route. `HttpxApiClient(base_url, request_map=Request, response_map=Response)` is the primary client and owns its `httpx` transport; `ApiClient(base_url, transport=..., request_map=Request, response_map=Response)` accepts any `Transport` implementation. Both carry the same typed route methods. Python cannot derive a call signature from the `TypedDict` maps the way TypeScript maps over `typeof Request`, so each route gets an explicit `Literal` path overload carrying its exact request models and result type. A verb with a single route is emitted as a plain typed method.

```python
GetUsersIdResult = Union[
    _client.ApiSuccess[Literal['200'], User],
    _client.ApiFailure[Literal['404'], NotFoundError],
    _client.ApiUnexpectedError,
]

class ApiClient(_client.BaseApiClient):
    async def get(
        self,
        path: Literal['/users/{id}'],
        *,
        params: GetUsersIdParams,
        query: GetUsersIdQuery | None = None,
        options: _client.RequestOptions | None = None,
    ) -> GetUsersIdResult: ...

class HttpxApiClient(ApiClient, _client.HttpxApiClient):
    pass
```

Route inputs are keyword arguments typed with the generated models: `params` is required when the path has parameters, `body` is required when the operation has a JSON request body, and `query` is optional. Transport concerns (`headers`, `timeout`, `retries`, `should_retry`) travel in `RequestOptions`.

```python
import asyncio

from python_pydantic_openapi.client import ApiFailure, ApiSuccess, RequestOptions

from generated_types import GetUsersIdParams, HttpxApiClient, Request, Response


async def main() -> None:
    async with HttpxApiClient(
        "https://api.example.com", request_map=Request, response_map=Response
    ) as client:
        result = await client.get(
            "/users/{id}",
            params=GetUsersIdParams(id="u_1"),
            options=RequestOptions(timeout=5.0, retries=2),
        )

    if isinstance(result, ApiSuccess):
        result.code  # Literal['200']
        result.body  # User
    elif isinstance(result, ApiFailure):
        result.code   # Literal['404']
        result.error  # NotFoundError
    else:
        result.code   # int, undocumented status or failed response validation
        result.error  # UnexpectedApiClientError

    await client.get("/users/{id}")            # error: params is required
    await client.get("/users")                 # error: no GET route for this path
    await client.post("/users", body=User())   # error: body must be CreateUserBody


asyncio.run(main())
```

Passing the maps mirrors `createApiClient({ baseUrl, Request, Response })` in TypeScript. Importing `HttpxApiClient` from the generated module gives the typed route methods; importing it from `python_pydantic_openapi.client` accepts the same arguments and gives runtime validation with the untyped `request()` API. Use `ApiClient(base_url, transport=..., request_map=..., response_map=...)` to plug in a different asyncio HTTP library.

Narrow results with `isinstance` or `match`; the `success` attribute is present for parity with the TypeScript client but not every checker narrows on it. Only documented statuses appear in the union; a route without a documented 2xx body (for example `204`) includes `ApiSuccess[str, Any]` so its success is representable.

## `python_pydantic_openapi.client`

The runtime half of the client lives in the installed package, not in generated code, and is transport-agnostic.

| Export | Purpose |
| --- | --- |
| `BaseApiClient` | Validates and encodes inputs with the `Request` map, sends through a `Transport`, validates responses with the `Response` map. `request(method, path, *, params, query, body, options)` returns an untyped `ApiResult`. |
| `Transport` | Protocol with `async def send(request: HttpRequest) -> HttpResponse`. Implement it to use any asyncio HTTP library. |
| `HttpxApiClient` | `BaseApiClient` that owns an `HttpxTransport`; constructed with `base_url`, `request_map`, `response_map`, optional `headers`, `on_validation_error`, `backoff`, and `httpx_client`. Supports `async with` and `aclose()`. Requires the `httpx` extra. |
| `HttpxTransport` | `Transport` over `httpx.AsyncClient`; requires the `httpx` extra. Parses JSON by content type, returns `None` for `content-length: 0`, maps `httpx.TimeoutException` to `ApiTimeoutError` and other `httpx.HTTPError`s to `UnexpectedApiClientError`. Supports `async with`. |
| `HttpRequest` / `HttpResponse` | Wire-level dataclasses exchanged with a transport. `HttpRequest.timeout` is in seconds. |
| `ApiSuccess` / `ApiFailure` / `ApiUnexpectedError` | Result dataclasses with `code`, `body` or `error`, `raw`, `headers`, and `success`. |
| `RequestOptions` | Per-call `headers`, `timeout`, `retries`, and `should_retry(RetryContext) -> bool`. |
| `ApiValidationError` | Raised before any I/O when `params`, `query`, or `body` fail the route's model. Never retried. |
| `ApiClientError`, `UnexpectedApiClientError`, `ApiTimeoutError` | Error hierarchy for transport and status failures. |
| `ValidationErrorContext` | Passed to the optional `on_validation_error` hook for request and response validation failures; handler exceptions are swallowed. |
| `exponential_backoff` | Default retry delay, `min(2 ** attempt, 30)` seconds; override with the `backoff` constructor argument. |

Request encoding follows the TypeScript client: inputs may be model instances or plain mappings, are validated with the route's model, and are serialized with `model_dump(mode="json", by_alias=True, exclude_unset=True)`. Path parameters are percent-encoded, `None` query values are dropped, lists repeat the key, and booleans become `true`/`false`. Bodies are sent only for `POST`, `PUT`, and `PATCH`. Header schemas from the `Request` map are not validated; pass header values through `RequestOptions.headers`.

Response handling: a documented status validates the body into its model and returns `ApiSuccess` for 2xx or `ApiFailure` otherwise. An undocumented 2xx returns `ApiSuccess` with the raw decoded body; an undocumented error status or a body that fails validation returns `ApiUnexpectedError` with an `UnexpectedApiClientError` carrying the status and raw data. Retries default to zero; with `retries > 0`, transport errors are retried with backoff except `UnexpectedApiClientError`s carrying a 4xx code, and `should_retry` can override the decision for both errors and responses.

## `all_of`

Generated non-object intersections import `python_pydantic_openapi.all_of`. The helper builds a `TypeAdapter` for every supplied type and returns `Annotated[Any, BeforeValidator(...)]`; validation succeeds only when every adapter accepts the same input, while the original input value is returned.

`all_of` and the client are available from their submodules, not from the package-root `__all__`.

## Root export checklist

`python_pydantic_openapi.__all__` contains exactly `SUPPORTED_STRING_FORMATS`, `clear_pydantic_schema_registry`, `get_schema_exported_variable_name_for_primitive_type`, `get_schema_exported_variable_name_for_string_format`, `openapi_to_pydantic_code`, `register_pydantic_type_to_openapi_schema`, and `schema_registry`.

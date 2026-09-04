# `alt-stack-pydantic-openapi`

Generate Python 3.11+ Pydantic 2 models, statically typed `Request`/`Response` route maps, and an asyncio `HttpxApiClient` from OpenAPI JSON. This is the Python counterpart of `@alt-stack/zod-openapi`; the generated client runs on `alt-stack-http-client-httpx`.

## Install

```bash
python -m pip install alt-stack-pydantic-openapi
```

Consumers of a generated SDK install the runtime package instead:

```bash
python -m pip install alt-stack-http-client-httpx
```

## Generate

```bash
alt-stack-pydantic-openapi ./openapi.json --output ./generated_types.py
```

`input` may be a local JSON path or HTTP(S) URL. Use `--registry` to execute custom type mappings and `--include` to insert imports/definitions into output.

```python
from generated_types import User

user = User.model_validate({"id": "u_1", "name": "Ada"})
```

The CLI enables route generation and emits `Request`/`Response` dictionaries whose leaves are Pydantic model classes. The dictionaries carry generated `TypedDict` annotations, so type checkers resolve literal lookups to the exact model and reject unknown paths, methods, request parts, and status codes:

```python
from generated_types import Request, Response

Request["/users"]["POST"]["body"]          # type[CreateUserBody]
Response["/users/{id}"]["GET"]["200"]      # type[User]
Response["/users/{id}"]["GET"]["999"]      # static error: unknown status
```

Generated modules also include an asyncio `HttpxApiClient` with one typed method per route, built on `alt_stack.http_client`:

```python
from alt_stack.http_client import ApiSuccess

from generated_types import GetUsersIdParams, HttpxApiClient, Request, Response

async with HttpxApiClient(
    "https://api.example.com", request_map=Request, response_map=Response
) as client:
    result = await client.get("/users/{id}", params=GetUsersIdParams(id="u_1"))

if isinstance(result, ApiSuccess):
    result.body  # User; unknown paths, missing params, and wrong models are static errors
```

Generated modules that use non-object intersections inline a small `all_of` validator, so they depend only on `pydantic` and `alt-stack-http-client-httpx` at runtime.

## Development

```bash
uv run --project packages/python-pydantic-openapi --extra dev pytest packages/python-pydantic-openapi/tests
uv run --project packages/python-pydantic-openapi --extra dev ruff check packages/python-pydantic-openapi
uv run --project packages/python-pydantic-openapi --extra dev ty check packages/python-pydantic-openapi
```

## Documentation

- [Code generation Quickstart](../../apps/docs/docs/codegen/quickstart.md)
- [Common Patterns](../../apps/docs/docs/codegen/common-patterns.md)
- [Python/Pydantic API Documentation](../../apps/docs/docs/codegen/api/pydantic-openapi.md)

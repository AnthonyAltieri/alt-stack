# `alt-stack-openapi-pydantic`

Generate Python 3.11+ Pydantic 2 models, statically typed `Request`/`Response` route maps, and an asyncio `HttpxApiClient` from OpenAPI JSON. This is the Python counterpart of `@alt-stack/zod-openapi`; the generated client runs on `alt-stack-http-client-httpx`.

## Install

```bash
python -m pip install alt-stack-openapi-pydantic
```

Consumers of a generated SDK install the runtime package instead:

```bash
python -m pip install alt-stack-http-client-httpx
```

## Generate

```bash
alt-stack-openapi-pydantic ./openapi.json --output ./generated_types.py
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

Generated modules also include an asyncio `HttpxApiClient` with one typed method per route, built on `alt_stack_http_client_httpx`:

```python
from alt_stack_http_client_httpx import ApiSuccess

from generated_types import GetUsersIdParams, HttpxApiClient, Request, Response

async with HttpxApiClient(
    "https://api.example.com", request_map=Request, response_map=Response
) as client:
    result = await client.get("/users/{id}", params=GetUsersIdParams(id="u_1"))

if isinstance(result, ApiSuccess):
    result.body  # User; unknown paths, missing params, and wrong models are static errors
```

Generated modules that use non-object intersections inline a small `all_of` validator, so they depend only on `pydantic` and `alt-stack-http-client-httpx` at runtime.

## Branded types

Annotate an identity schema in OpenAPI:

```json
{ "type": "string", "format": "uuid", "x-altstack-brand": "UserId" }
```

The generated module declares `UserId = NewType("UserId", UUID)` once and uses it
in field and parameter annotations. Pydantic still parses UUID strings into UUID
values and applies each use's existing constraints. Optional and nullable fields,
references, array items, and union members retain the nominal type.

Names must be ASCII identifiers (`[A-Za-z_][A-Za-z0-9_]*`) and must not be Python
keywords, imported helper names, or unrelated component names. Conflicting base
types produce a generation error. If a component and its brand have the same name,
the Pydantic wrapper is named `UserIdModel`, leaving `UserId` for the `NewType`.
Python requires a class as a `NewType` base. Literal brands use their primitive
base; composite unions use `object` with the original Pydantic validator retained
in `Annotated` metadata.

## Identifiers and wire names

Component names become Python identifiers: `Rule-Output` becomes `Rule_Output`,
leading digits gain an underscore, and Python keywords gain a trailing underscore.
Names that normalize to the same identifier cause a generation error with both
original names. References and route maps use the generated identifiers.

Underscore properties become public fields with aliases: `_id` becomes `id_`.
Invalid property characters and Python keywords are also handled, with numeric
suffixes where needed to avoid field collisions. Validate with the original wire
names and use `model_dump(by_alias=True)` or `model_dump_json(by_alias=True)` to
serialize them. The HTTP client serializes aliases automatically.

## Development

```bash
uv sync --project packages/python-pydantic-openapi --extra dev
packages/python-pydantic-openapi/.venv/bin/pytest packages/python-pydantic-openapi/tests -q
packages/python-pydantic-openapi/.venv/bin/ruff check packages/python-pydantic-openapi
packages/python-pydantic-openapi/.venv/bin/ty check packages/python-pydantic-openapi
```

## Documentation

- [Code generation Quickstart](../../apps/docs/docs/codegen/quickstart.md)
- [Common Patterns](../../apps/docs/docs/codegen/common-patterns.md)
- [Python/Pydantic API Documentation](../../apps/docs/docs/codegen/api/pydantic-openapi.md)

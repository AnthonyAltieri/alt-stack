# `python-pydantic-openapi`

Generate Python 3.11+ Pydantic 2 models and route lookup dictionaries from OpenAPI JSON.

## Install

```bash
python -m pip install python-pydantic-openapi
```

## Generate

```bash
python-pydantic-openapi ./openapi.json --output ./generated_types.py
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

Generated modules that use intersections import the installed package's `all_of` helper.

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

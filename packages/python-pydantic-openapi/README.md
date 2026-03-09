# python-pydantic-openapi

Convert OpenAPI 3.x schemas to Pydantic models with Python code generation.

## Features

- Generates named `BaseModel` and `RootModel` classes from OpenAPI schemas
- Hoists inline object shapes into deterministic named models
- Handles objects, arrays, enums, unions (`oneOf` / `anyOf`), intersections (`allOf`)
- Supports nullable fields and validation constraints
- Route request/response lookup objects from OpenAPI paths that reference generated classes
- Custom format registry for mapping OpenAPI formats to custom Python types

## Installation

```bash
uv pip install python-pydantic-openapi
```

Or with pip:

```bash
pip install python-pydantic-openapi
```

## CLI Usage

```bash
python-pydantic-openapi <input> [options]
```

Options:

- `-o, --output <file>`: output file path (default: `generated-types.py`)
- `-r, --registry <file>`: registry file that registers custom schemas
- `-i, --include <file>`: Python file to include at top of generated output

Examples:

```bash
# Generate from local file
python-pydantic-openapi openapi.json

# Generate from URL
python-pydantic-openapi http://localhost:3000/docs/openapi.json

# Specify output file
python-pydantic-openapi openapi.json -o src/api_types.py
```

## Programmatic Usage

```python
from python_pydantic_openapi import openapi_to_pydantic_code

openapi = {
    "components": {
        "schemas": {
            "User": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "email": {"type": "string", "format": "email"},
                },
                "required": ["id", "email"],
            }
        }
    }
}

code = openapi_to_pydantic_code(openapi, options={"include_routes": True})
print(code)
```

Generated modules expose schema classes directly, so validation uses normal Pydantic entrypoints:

```python
from generated_types import User, Request

user = User.model_validate({"id": 1, "email": "dev@example.com"})
params_model = Request["/users/{id}"]["GET"]["params"]
params = params_model.model_validate({"id": "123"})
```

## Custom String Formats

```python
from python_pydantic_openapi import register_pydantic_type_to_openapi_schema
from pydantic import BaseModel

class DateTimeSchema(BaseModel):
    value: str

register_pydantic_type_to_openapi_schema(DateTimeSchema, {
    "schema_exported_variable_name": "DateTimeSchema",
    "type": "string",
    "format": "iso-date-time",
})
```

## Releases

This package is published to PyPI from GitHub Actions via [`.github/workflows/publish-python-package.yml`](/Users/anthonyaltieri/.codex/worktrees/df7f/alt-stack/.github/workflows/publish-python-package.yml).

- Push a version bump for `packages/python-pydantic-openapi/pyproject.toml` to `main` or `master`, and the workflow will check whether that version already exists on PyPI.
- If the version is unpublished, CI builds both the wheel and sdist with `uv build`, validates the metadata with `twine check`, publishes to PyPI, and tags the release as `python-pydantic-openapi@<version>`.
- Manual runs support `dry_run=true` so you can verify the build artifacts without publishing or creating a tag.

Before the first release, configure PyPI trusted publishing for this repository and the `pypi` GitHub Actions environment so [`pypa/gh-action-pypi-publish`](https://github.com/pypa/gh-action-pypi-publish) can mint credentials without a long-lived API token.

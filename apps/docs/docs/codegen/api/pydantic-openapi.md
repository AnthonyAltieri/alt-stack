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

When routes are enabled, the output contains route model classes plus `Request` and `Response` dictionaries. Bare request methods with no params/query/headers/body are not entered in `Request`. JSON response schemas are keyed by their string status.

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

## `all_of`

Generated non-object intersections import `python_pydantic_openapi.all_of`. The helper builds a `TypeAdapter` for every supplied type and returns `Annotated[Any, BeforeValidator(...)]`; validation succeeds only when every adapter accepts the same input, while the original input value is returned.

`all_of` is available from its submodule, not from the package-root `__all__`.

## Root export checklist

`python_pydantic_openapi.__all__` contains exactly `SUPPORTED_STRING_FORMATS`, `clear_pydantic_schema_registry`, `get_schema_exported_variable_name_for_primitive_type`, `get_schema_exported_variable_name_for_string_format`, `openapi_to_pydantic_code`, `register_pydantic_type_to_openapi_schema`, and `schema_registry`.

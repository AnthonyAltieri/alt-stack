"""Static-typing parity for generated ``Request`` / ``Response`` route maps.

TypeScript consumers get exact route inference from ``as const`` maps. These tests
generate a Python module, write a consumer that indexes the route maps with literal
keys, and run real type checkers over both files. They pass only when:

* a known request/response leaf is inferred as its exact ``type[Model]``;
* unknown paths, methods, request parts, and status codes are static errors;
* the generated ``ApiClient`` infers exact request models and result unions per route;
* the generated module itself is free of type errors.
"""

from __future__ import annotations

import importlib.util
import json
import re
import shutil
import subprocess
import sys
import types
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Callable

import pytest

from alt_stack.pydantic_openapi.registry import clear_pydantic_schema_registry
from alt_stack.pydantic_openapi.to_python import openapi_to_pydantic_code

EXPECT_ERROR = "# expect-error"

TENANTS_PATH = "/api/v1/tenants"
TENANT_PATH = "/api/v1/tenants/{tenantId}"
HEALTH_PATH = "/api/v1/health"


def _json_content(schema: dict[str, Any]) -> dict[str, Any]:
    return {"content": {"application/json": {"schema": schema}}}


def _ref(name: str) -> dict[str, Any]:
    return {"$ref": f"#/components/schemas/{name}"}


ROUTE_FIXTURE: dict[str, Any] = {
    "components": {
        "schemas": {
            "CreateTenantDto": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "regions": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name", "regions"],
                "additionalProperties": False,
            },
            "Tenant": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "name": {"type": "string"},
                },
                "required": ["id", "name"],
            },
            "ApiError": {
                "type": "object",
                "properties": {
                    "code": {"type": "string"},
                    "message": {"type": "string"},
                },
                "required": ["code", "message"],
            },
        }
    },
    "paths": {
        TENANTS_PATH: {
            "post": {
                "requestBody": _json_content(_ref("CreateTenantDto")),
                "responses": {
                    "201": _json_content(_ref("Tenant")),
                    "400": _json_content(_ref("ApiError")),
                },
            }
        },
        TENANT_PATH: {
            "get": {
                "parameters": [
                    {
                        "name": "tenantId",
                        "in": "path",
                        "required": True,
                        "schema": {"type": "string"},
                    },
                    {
                        "name": "include",
                        "in": "query",
                        "required": False,
                        "schema": {"type": "string"},
                    },
                ],
                "responses": {
                    "200": _json_content(_ref("Tenant")),
                    "404": _json_content(_ref("ApiError")),
                },
            }
        },
        HEALTH_PATH: {
            "get": {
                "responses": {
                    "200": _json_content(
                        {
                            "type": "object",
                            "properties": {"status": {"type": "string"}},
                            "required": ["status"],
                        }
                    )
                }
            }
        },
    },
}


def _load_module(path: Path) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(path.stem, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _consumer_source(module: types.ModuleType) -> str:
    request_map = module.Request
    response_map = module.Response
    params_model = request_map[TENANT_PATH]["GET"]["params"].__name__
    query_model = request_map[TENANT_PATH]["GET"]["query"].__name__
    health_model = response_map[HEALTH_PATH]["GET"]["200"].__name__
    dto = 'CreateTenantDto(name="iad", regions=["us-east-1"])'
    tenant_params = f'{params_model}(tenantId="t_1")'

    return "\n".join(
        [
            "from typing import Literal, assert_type",
            "",
            "import alt_stack.http_client as client_lib",
            "from generated_sdk import (",
            "    ApiClient,",
            "    ApiError,",
            "    CreateTenantDto,",
            "    GetApiV1HealthResult,",
            "    GetApiV1TenantsTenantidResult,",
            "    HttpxApiClient,",
            "    PostApiV1TenantsResult,",
            f"    {params_model},",
            f"    {query_model},",
            f"    {health_model},",
            "    Request,",
            "    Response,",
            "    Tenant,",
            ")",
            "",
            "# Exact request leaves",
            f'assert_type(Request["{TENANTS_PATH}"]["POST"]["body"], type[CreateTenantDto])',
            f'assert_type(Request["{TENANT_PATH}"]["GET"]["params"], type[{params_model}])',
            f'assert_type(Request["{TENANT_PATH}"]["GET"]["query"], type[{query_model}])',
            "",
            "# Exact response leaves, including non-2xx statuses",
            f'assert_type(Response["{TENANTS_PATH}"]["POST"]["201"], type[Tenant])',
            f'assert_type(Response["{TENANTS_PATH}"]["POST"]["400"], type[ApiError])',
            f'assert_type(Response["{TENANT_PATH}"]["GET"]["200"], type[Tenant])',
            f'assert_type(Response["{TENANT_PATH}"]["GET"]["404"], type[ApiError])',
            f'assert_type(Response["{HEALTH_PATH}"]["GET"]["200"], type[{health_model}])',
            "",
            "# Leaves are usable as the exact model class without casts",
            f'body_model: type[CreateTenantDto] = Request["{TENANTS_PATH}"]["POST"]["body"]',
            'payload = body_model(name="iad", regions=["us-east-1"])',
            "assert_type(payload.name, str)",
            f'tenant = Response["{TENANTS_PATH}"]["POST"]["201"].model_validate(',
            '    {"id": "t_1", "name": "iad"}',
            ")",
            "assert_type(tenant, Tenant)",
            "assert_type(tenant.id, str)",
            "",
            "# Unknown route keys are rejected statically",
            f'Request["/api/v1/not-a-route"]  {EXPECT_ERROR}',
            f'Request["{TENANTS_PATH}"]["GET"]  {EXPECT_ERROR}',
            f'Request["{TENANTS_PATH}"]["POST"]["query"]  {EXPECT_ERROR}',
            f'Request["{HEALTH_PATH}"]["GET"]["body"]  {EXPECT_ERROR}',
            f'Response["/api/v1/not-a-route"]  {EXPECT_ERROR}',
            f'Response["{TENANTS_PATH}"]["GET"]  {EXPECT_ERROR}',
            f'Response["{TENANTS_PATH}"]["POST"]["999"]  {EXPECT_ERROR}',
            "",
            "# Leaves are not widened to a union of unrelated models",
            f'not_tenant: type[Tenant] = Request["{TENANTS_PATH}"]["POST"]["body"]  {EXPECT_ERROR}',
            f'not_dto: type[CreateTenantDto] = Response["{TENANTS_PATH}"]["POST"]["201"]  '
            f"{EXPECT_ERROR}",
            f'Request["{TENANTS_PATH}"]["POST"]["body"](name=123, regions=[])  {EXPECT_ERROR}',
            f'Response["{TENANTS_PATH}"]["POST"]["201"].model_validate({{}}).nope  {EXPECT_ERROR}',
            "",
            "",
            "async def build_clients() -> None:",
            "    # The primary constructor takes the maps and owns its transport",
            "    httpx_client = HttpxApiClient(",
            '        "https://x", request_map=Request, response_map=Response',
            "    )",
            "    assert_type(httpx_client, HttpxApiClient)",
            f'    fetched = await httpx_client.get("{TENANT_PATH}", params={tenant_params})',
            "    assert_type(fetched, GetApiV1TenantsTenantidResult)",
            '    HttpxApiClient("https://x")  ' + EXPECT_ERROR,
            "",
            "",
            "async def use_client(client: ApiClient) -> None:",
            "    # Typed route methods infer the exact request model and result union",
            f'    created = await client.post("{TENANTS_PATH}", body={dto})',
            "    assert_type(created, PostApiV1TenantsResult)",
            "    if isinstance(created, client_lib.ApiSuccess):",
            '        assert_type(created.code, Literal["201"])',
            "        assert_type(created.body, Tenant)",
            "    elif isinstance(created, client_lib.ApiFailure):",
            '        assert_type(created.code, Literal["400"])',
            "        assert_type(created.error, ApiError)",
            "    else:",
            "        assert_type(created, client_lib.ApiUnexpectedError)",
            "",
            f'    fetched = await client.get("{TENANT_PATH}", params={tenant_params})',
            "    assert_type(fetched, GetApiV1TenantsTenantidResult)",
            "    match fetched:",
            "        case client_lib.ApiSuccess(body=tenant_body):",
            "            assert_type(tenant_body, Tenant)",
            "        case client_lib.ApiFailure(error=api_error):",
            "            assert_type(api_error, ApiError)",
            "        case client_lib.ApiUnexpectedError(code=status):",
            "            assert_type(status, int)",
            "",
            f'    health = await client.get("{HEALTH_PATH}")',
            "    assert_type(health, GetApiV1HealthResult)",
            "    if isinstance(health, client_lib.ApiSuccess):",
            f"        assert_type(health.body, {health_model})",
            "",
            "    # Routes and inputs absent from the contract are rejected statically",
            f'    await client.post("/api/v1/not-a-route", body={dto})  {EXPECT_ERROR}',
            f'    await client.post("{TENANTS_PATH}")  {EXPECT_ERROR}',
            f'    await client.post("{TENANTS_PATH}", body=Tenant(id="1", name="x"))  '
            f"{EXPECT_ERROR}",
            f'    await client.get("{TENANTS_PATH}")  {EXPECT_ERROR}',
            f'    await client.get("{TENANT_PATH}")  {EXPECT_ERROR}',
            f'    await client.get("{HEALTH_PATH}", params={tenant_params})  {EXPECT_ERROR}',
            f'    await client.put("{TENANTS_PATH}", body={dto})  {EXPECT_ERROR}',
            "",
        ]
    )


def _expected_error_lines(source: str) -> set[int]:
    return {
        index for index, line in enumerate(source.splitlines(), start=1) if EXPECT_ERROR in line
    }


def _checker_binary(name: str) -> str:
    candidate = Path(sys.executable).parent / name
    if candidate.exists():
        return str(candidate)
    found = shutil.which(name)
    if found is None:
        pytest.fail(f"{name} is required for route typing tests; install the dev extras")
    return found


def _run_checker(command: list[str], cwd: Path) -> str:
    completed = subprocess.run(
        command,
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )
    return completed.stdout + completed.stderr


def _error_lines(output: str, file_name: str, pattern: str) -> set[int]:
    lines: set[int] = set()
    for match in re.finditer(pattern.format(file=re.escape(file_name)), output, re.MULTILINE):
        lines.add(int(match.group("line")))
    return lines


TY_PATTERN = r"^(?:.*/)?{file}:(?P<line>\d+):\d+: error\["
PYREFLY_PATTERN = r"^ERROR (?:.*/)?{file}:(?P<line>\d+):"


def _check_with_ty(workdir: Path) -> str:
    return _run_checker(
        [
            _checker_binary("ty"),
            "check",
            "--python",
            sys.executable,
            "--output-format",
            "concise",
            "generated_sdk.py",
            "consumer.py",
        ],
        workdir,
    )


def _check_with_pyrefly(workdir: Path) -> str:
    (workdir / "pyrefly.toml").write_text(
        "\n".join(
            [
                'project-includes = ["generated_sdk.py", "consumer.py"]',
                f"python-interpreter = {str(sys.executable)!r}",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return _run_checker(
        [
            _checker_binary("pyrefly"),
            "check",
            "--config",
            "pyrefly.toml",
            "--output-format",
            "min-text",
        ],
        workdir,
    )


def _assert_route_contract(checker_output: str, pattern: str, expected_errors: set[int]) -> None:
    generated_errors = _error_lines(checker_output, "generated_sdk.py", pattern)
    assert generated_errors == set(), (
        f"generated module has type errors on lines {sorted(generated_errors)}\n{checker_output}"
    )

    consumer_errors = _error_lines(checker_output, "consumer.py", pattern)
    missing = expected_errors - consumer_errors
    unexpected = consumer_errors - expected_errors
    assert not missing, (
        f"expected static errors on consumer lines {sorted(missing)} but none reported\n"
        f"{checker_output}"
    )
    assert not unexpected, (
        f"unexpected static errors on consumer lines {sorted(unexpected)}\n{checker_output}"
    )


@pytest.fixture(scope="module")
def generated_workdir() -> Any:
    clear_pydantic_schema_registry()
    code = openapi_to_pydantic_code(ROUTE_FIXTURE, options={"include_routes": True})
    with TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        module_path = workdir / "generated_sdk.py"
        module_path.write_text(code, encoding="utf-8")
        module = _load_module(module_path)
        consumer = _consumer_source(module)
        (workdir / "consumer.py").write_text(consumer, encoding="utf-8")
        yield workdir, _expected_error_lines(consumer)


def test_route_maps_keep_runtime_dict_api(generated_workdir: tuple[Path, set[int]]) -> None:
    workdir, _ = generated_workdir
    module = _load_module(workdir / "generated_sdk.py")

    assert isinstance(module.Request, dict)
    assert isinstance(module.Response, dict)
    assert module.Request[TENANTS_PATH]["POST"]["body"] is module.CreateTenantDto
    assert module.Response[TENANTS_PATH]["POST"]["201"] is module.Tenant
    assert module.Response[TENANTS_PATH]["POST"]["400"] is module.ApiError
    assert module.Request[HEALTH_PATH]["GET"] == {}
    assert set(module.Request) == set(module.Response) == {TENANTS_PATH, TENANT_PATH, HEALTH_PATH}


def test_route_maps_infer_exact_models_with_ty(generated_workdir: tuple[Path, set[int]]) -> None:
    workdir, expected_errors = generated_workdir
    _assert_route_contract(_check_with_ty(workdir), TY_PATTERN, expected_errors)


def test_route_maps_infer_exact_models_with_pyrefly(
    generated_workdir: tuple[Path, set[int]],
) -> None:
    workdir, expected_errors = generated_workdir
    _assert_route_contract(_check_with_pyrefly(workdir), PYREFLY_PATTERN, expected_errors)


@pytest.mark.parametrize(
    ("check", "pattern"),
    [
        pytest.param(_check_with_ty, TY_PATTERN, id="ty"),
        pytest.param(_check_with_pyrefly, PYREFLY_PATTERN, id="pyrefly"),
    ],
)
def test_master_spec_route_maps_type_check(
    check: Callable[[Path], str],
    pattern: str,
) -> None:
    """The full test spec's route maps produce a type-clean module (no name collisions)."""
    clear_pydantic_schema_registry()
    spec_path = Path(__file__).resolve().parents[2] / "openapi-test-spec" / "openapi.json"
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    code = openapi_to_pydantic_code(spec, options={"include_routes": True})

    with TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        (workdir / "generated_sdk.py").write_text(code, encoding="utf-8")
        (workdir / "consumer.py").write_text("from generated_sdk import Request, Response\n")
        output = check(workdir)
        errors = _error_lines(output, "generated_sdk.py", pattern)
        assert errors == set(), (
            f"generated module has type errors on lines {sorted(errors)}\n{output}"
        )

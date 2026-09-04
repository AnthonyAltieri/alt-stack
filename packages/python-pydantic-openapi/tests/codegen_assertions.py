from __future__ import annotations

from textwrap import dedent
from typing import Any

from alt_stack_pydantic_openapi.to_python import openapi_to_pydantic_code

PREAMBLE = dedent(
    """\
    # This file was automatically generated from OpenAPI schema
    # Do not manually edit this file
    from __future__ import annotations

    from typing import Any, Annotated, Final, Literal, Optional, TypedDict, Union
    from typing import cast, overload
    from datetime import date, datetime
    from uuid import UUID

    from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, RootModel
    from pydantic import TypeAdapter
    from pydantic import AnyUrl, EmailStr
    import alt_stack_http_client_httpx as _client

    def _reject_explicit_none(value: Any) -> Any:
        if value is None:
            raise ValueError("Field may be omitted but may not be null")
        return value

    _omit_not_null = BeforeValidator(_reject_explicit_none)
    """
).strip()


def normalize(text: str) -> str:
    return dedent(text).strip()


def with_preamble(body: str = "") -> str:
    normalized_body = normalize(body)
    if not normalized_body:
        return PREAMBLE
    return f"{PREAMBLE}\n\n{normalized_body}"


def assert_generated_code(
    openapi: dict[str, Any],
    expected_body: str,
    options: dict[str, Any] | None = None,
) -> None:
    code = openapi_to_pydantic_code(openapi, options=options).strip()
    assert code == with_preamble(expected_body)

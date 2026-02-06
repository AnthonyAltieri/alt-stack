from __future__ import annotations

from textwrap import dedent
from typing import Any

from python_zod_openapi.to_python import openapi_to_pydantic_code

PREAMBLE = dedent(
    """\
    # This file was automatically generated from OpenAPI schema
    # Do not manually edit this file
    from __future__ import annotations

    from typing import Any, Annotated, Literal, Optional, TypeAlias, Union
    from datetime import date, datetime
    from uuid import UUID

    from pydantic import BaseModel, ConfigDict, Field, RootModel, TypeAdapter
    from pydantic import AnyUrl, EmailStr
    from python_zod_openapi.all_of import all_of
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

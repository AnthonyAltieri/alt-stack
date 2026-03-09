from __future__ import annotations

from typing import Annotated, Any

from pydantic import BeforeValidator, TypeAdapter


def all_of(*types: Any) -> Any:
    adapters = [TypeAdapter(t) for t in types]

    def validate(value: Any) -> Any:
        for adapter in adapters:
            adapter.validate_python(value)
        return value

    return Annotated[Any, BeforeValidator(validate)]

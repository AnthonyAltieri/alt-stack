from __future__ import annotations

import keyword
import re

_VALID_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def to_pascal_case(value: str) -> str:
    parts = re.split(r"[^A-Za-z0-9]+", value)
    return "".join(part[:1].upper() + part[1:] for part in parts if part)


def to_snake_case(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_")
    if not value:
        return "field"
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value)
    return value.lower()


def safe_identifier(name: str, used: set[str]) -> tuple[str, bool]:
    candidate = to_snake_case(name)
    if not _VALID_IDENTIFIER.match(candidate) or keyword.iskeyword(candidate):
        candidate = f"_{candidate}"
    base = candidate
    idx = 1
    while candidate in used:
        idx += 1
        candidate = f"{base}_{idx}"
    used.add(candidate)
    return candidate, candidate != name

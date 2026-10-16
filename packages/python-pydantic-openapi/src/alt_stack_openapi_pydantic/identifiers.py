from __future__ import annotations

import keyword
import re
from collections.abc import Iterable


def component_identifiers(names: Iterable[str]) -> dict[str, str]:
    """Keep wire names separate from the unique symbols used in Python source."""
    identifiers: dict[str, str] = {}
    owners: dict[str, str] = {}
    for name in names:
        identifier = re.sub(r"[^A-Za-z0-9_]", "_", name) or "Schema"
        if identifier[0].isdigit():
            identifier = f"_{identifier}"
        if keyword.iskeyword(identifier):
            identifier += "_"
        if identifier in owners:
            raise ValueError(
                f"Component names {owners[identifier]!r} and {name!r} normalize to the "
                f"same Python identifier {identifier!r}"
            )
        identifiers[name] = identifier
        owners[identifier] = name
    return identifiers


def field_identifiers(names: Iterable[str]) -> dict[str, str]:
    names = list(names)
    wire_names = set(names)
    identifiers: dict[str, str] = {}
    used: set[str] = set()
    for name in names:
        candidate = re.sub(r"[^A-Za-z0-9_]", "_", name)
        if candidate and candidate[0].isupper() and candidate[1:].islower():
            candidate = candidate[0].lower() + candidate[1:]
        if not candidate or candidate.startswith("_"):
            candidate = f"{candidate.lstrip('_') or 'field'}_"
        if candidate[0].isdigit():
            candidate = f"field_{candidate}"
        if keyword.iskeyword(candidate):
            candidate += "_"

        # Preserve existing casing aliases, and reserve wire names when repairing fields.
        unavailable = used
        if not name.isidentifier() or name.startswith("_") or keyword.iskeyword(name):
            unavailable = used | wire_names
        identifier = candidate
        index = 2
        while identifier in unavailable:
            identifier = f"{candidate}_{index}"
            index += 1
        identifiers[name] = identifier
        used.add(identifier)
    return identifiers

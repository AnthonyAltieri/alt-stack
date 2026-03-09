from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .rendering import needs_named_model
from .types import AnySchema
from .utils import to_pascal_case


@dataclass(slots=True)
class NamedSchema:
    name: str
    schema: AnySchema


@dataclass(slots=True)
class LoweringContext:
    used_names: set[str] = field(default_factory=set)

    def reserve_name(self, base_name: str) -> str:
        if base_name not in self.used_names:
            self.used_names.add(base_name)
            return base_name

        index = 2
        while f"{base_name}_{index}" in self.used_names:
            index += 1

        reserved = f"{base_name}_{index}"
        self.used_names.add(reserved)
        return reserved


def lower_named_schema(
    context: LoweringContext,
    name: str,
    schema: AnySchema,
) -> list[NamedSchema]:
    lowered, hoisted = _lower_schema(context, name, schema)
    return [*hoisted, NamedSchema(name=name, schema=lowered)]


def _lower_schema(
    context: LoweringContext,
    parent_name: str,
    schema: AnySchema,
) -> tuple[AnySchema, list[NamedSchema]]:
    if not isinstance(schema, dict):
        return schema, []

    lowered = dict(schema)
    hoisted: list[NamedSchema] = []

    properties = lowered.get("properties")
    if isinstance(properties, dict):
        lowered_properties: dict[str, AnySchema] = {}
        for prop_name, prop_schema in properties.items():
            child_name = f"{parent_name}{to_pascal_case(prop_name)}"
            lowered_child, child_hoisted = _lower_child_schema(context, child_name, prop_schema)
            lowered_properties[prop_name] = lowered_child
            hoisted.extend(child_hoisted)
        lowered["properties"] = lowered_properties

    items = lowered.get("items")
    if isinstance(items, dict):
        lowered_items, item_hoisted = _lower_child_schema(
            context,
            f"{parent_name}Item",
            items,
        )
        lowered["items"] = lowered_items
        hoisted.extend(item_hoisted)

    additional = lowered.get("additionalProperties")
    if isinstance(additional, dict):
        lowered_additional, additional_hoisted = _lower_child_schema(
            context,
            f"{parent_name}Value",
            additional,
        )
        lowered["additionalProperties"] = lowered_additional
        hoisted.extend(additional_hoisted)

    for keyword, suffix in (("oneOf", "Option"), ("anyOf", "Option"), ("allOf", "Part")):
        value = lowered.get(keyword)
        if not isinstance(value, list):
            continue
        lowered_items_list: list[AnySchema] = []
        for index, item in enumerate(value, start=1):
            child_name = f"{parent_name}{suffix}{index}"
            lowered_item, item_hoisted = _lower_child_schema(context, child_name, item)
            lowered_items_list.append(lowered_item)
            hoisted.extend(item_hoisted)
        lowered[keyword] = lowered_items_list

    return lowered, hoisted


def _lower_child_schema(
    context: LoweringContext,
    child_name: str,
    schema: AnySchema,
) -> tuple[AnySchema, list[NamedSchema]]:
    if not isinstance(schema, dict):
        return schema, []

    if needs_named_model(schema):
        reserved_name = context.reserve_name(child_name)
        lowered_schema, hoisted = _lower_schema(context, reserved_name, schema)
        ref_schema: dict[str, Any] = {"$ref": f"#/components/schemas/{reserved_name}"}
        if schema.get("nullable") is True:
            ref_schema["nullable"] = True
        return ref_schema, [*hoisted, NamedSchema(name=reserved_name, schema=lowered_schema)]

    return _lower_schema(context, child_name, schema)

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal, TypeAlias, TypedDict, cast

SUPPORTED_STRING_FORMATS = [
    "color-hex",
    "date",
    "date-time",
    "email",
    "iso-date",
    "iso-date-time",
    "objectid",
    "uri",
    "url",
    "uuid",
]

SupportedStringFormat = Literal[
    "color-hex",
    "date",
    "date-time",
    "email",
    "iso-date",
    "iso-date-time",
    "objectid",
    "uri",
    "url",
    "uuid",
]


class PydanticOpenApiRegistrationString(TypedDict):
    schema_exported_variable_name: str
    type: Literal["string"]
    format: SupportedStringFormat
    description: str | None


class PydanticOpenApiRegistrationStrings(TypedDict):
    schema_exported_variable_name: str
    type: Literal["string"]
    formats: list[SupportedStringFormat]
    description: str | None


class PydanticOpenApiRegistrationPrimitive(TypedDict):
    schema_exported_variable_name: str
    type: Literal["number", "integer", "boolean"]
    description: str | None


if TYPE_CHECKING:
    PydanticOpenApiRegistration: TypeAlias = (
        PydanticOpenApiRegistrationString
        | PydanticOpenApiRegistrationStrings
        | PydanticOpenApiRegistrationPrimitive
    )
else:
    PydanticOpenApiRegistration = dict[str, Any]


class PydanticSchemaRegistry:
    def __init__(self) -> None:
        self._string_format_to_name: dict[str, str] = {}
        self._primitive_type_to_name: dict[str, str] = {}
        self._schema_ids: dict[int, PydanticOpenApiRegistration] = {}

    def register(self, schema: Any, registration: PydanticOpenApiRegistration) -> None:
        reg_type = registration["type"]
        registration_dict = cast(dict[str, Any], registration)

        if reg_type == "string":
            format_value = registration_dict.get("format")
            if isinstance(format_value, str):
                self._register_string_format(format_value, registration)
                self._schema_ids[id(schema)] = registration
                return

            format_values = registration_dict.get("formats")
            if isinstance(format_values, list):
                for format_item in format_values:
                    if isinstance(format_item, str):
                        self._register_string_format(format_item, registration)
                self._schema_ids[id(schema)] = registration
                return

        if reg_type in {"number", "integer", "boolean"}:
            name = registration["schema_exported_variable_name"]
            existing = self._primitive_type_to_name.get(reg_type)
            if existing and existing != name:
                raise ValueError(
                    f"duplicate Pydantic OpenAPI registration for type '{reg_type}'",
                )
            self._primitive_type_to_name[reg_type] = name
            self._schema_ids[id(schema)] = registration
            return

        raise ValueError("unsupported registration type")

    def _register_string_format(
        self,
        fmt: SupportedStringFormat | str,
        registration: PydanticOpenApiRegistration,
    ) -> None:
        if fmt not in SUPPORTED_STRING_FORMATS:
            raise ValueError(f"unsupported string format registration: {fmt!r}")
        name = registration["schema_exported_variable_name"]
        existing = self._string_format_to_name.get(fmt)
        if existing and existing != name:
            raise ValueError(
                f"duplicate Pydantic OpenAPI registration for (type, format)=('string', '{fmt}')",
            )
        self._string_format_to_name[fmt] = name

    def clear(self) -> None:
        self._string_format_to_name.clear()
        self._primitive_type_to_name.clear()
        self._schema_ids.clear()

    def get_schema_exported_variable_name_for_string_format(
        self, format_value: SupportedStringFormat | str
    ) -> str | None:
        if format_value not in SUPPORTED_STRING_FORMATS:
            return None
        return self._string_format_to_name.get(format_value)

    def get_schema_exported_variable_name_for_primitive_type(
        self, type_value: Literal["number", "integer", "boolean"]
    ) -> str | None:
        return self._primitive_type_to_name.get(type_value)

    def is_registered(self, schema: Any) -> bool:
        return id(schema) in self._schema_ids


schema_registry = PydanticSchemaRegistry()


def register_pydantic_type_to_openapi_schema(
    schema: Any,
    registration: PydanticOpenApiRegistration,
) -> None:
    schema_registry.register(schema, registration)


def clear_pydantic_schema_registry() -> None:
    schema_registry.clear()


def get_schema_exported_variable_name_for_string_format(
    format_value: SupportedStringFormat | str,
) -> str | None:
    return schema_registry.get_schema_exported_variable_name_for_string_format(
        format_value,
    )


def get_schema_exported_variable_name_for_primitive_type(
    type_value: Literal["number", "integer", "boolean"],
) -> str | None:
    return schema_registry.get_schema_exported_variable_name_for_primitive_type(type_value)

from __future__ import annotations

import importlib.util
import types
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import UUID

import pytest
from pydantic import ValidationError

from python_pydantic_openapi.registry import (
    clear_pydantic_schema_registry,
    register_pydantic_type_to_openapi_schema,
)
from python_pydantic_openapi.to_python import openapi_to_pydantic_code
from tests.codegen_assertions import assert_generated_code


def setup_function() -> None:
    clear_pydantic_schema_registry()


def _load_module(code: str) -> types.ModuleType:
    with TemporaryDirectory() as tmp:
        path = Path(tmp) / "generated.py"
        path.write_text(code, encoding="utf-8")
        spec = importlib.util.spec_from_file_location("generated", path)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module


def test_route_generation_basic() -> None:
    openapi = {
        "components": {
            "schemas": {
                "User": {
                    "type": "object",
                    "properties": {"id": {"type": "string"}, "name": {"type": "string"}},
                    "required": ["id", "name"],
                }
            }
        },
        "paths": {
            "/users/{id}": {
                "get": {
                    "parameters": [
                        {
                            "name": "id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                        }
                    ],
                    "responses": {
                        "200": {
                            "content": {
                                "application/json": {
                                    "schema": {"$ref": "#/components/schemas/User"}
                                }
                            }
                        }
                    },
                }
            }
        },
    }

    assert_generated_code(
        openapi,
        """
        class User(BaseModel):
            model_config = ConfigDict(extra='allow')
            id: Annotated[str, Field(strict=True)]
            name: Annotated[str, Field(strict=True)]

        # Route Schemas
        class GetUsersIdParams(BaseModel):
            model_config = ConfigDict(extra='forbid')
            id: Annotated[str, Field(strict=True)]


        User.model_rebuild()
        GetUsersIdParams.model_rebuild()


        Request = {
            '/users/{id}': {
                'GET': {
                    'params': GetUsersIdParams,
                },
            },
        }

        Response = {
            '/users/{id}': {
                'GET': {
                    '200': User,
                },
            },
        }
        """,
        options={"include_routes": True},
    )


def test_route_with_query_params() -> None:
    openapi = {
        "components": {"schemas": {}},
        "paths": {
            "/users": {
                "get": {
                    "parameters": [
                        {
                            "name": "limit",
                            "in": "query",
                            "required": False,
                            "schema": {"type": "number"},
                        },
                        {
                            "name": "offset",
                            "in": "query",
                            "required": False,
                            "schema": {"type": "number"},
                        },
                    ],
                    "responses": {
                        "200": {
                            "content": {
                                "application/json": {"schema": {"type": "object", "properties": {}}}
                            }
                        }
                    },
                }
            }
        },
    }

    assert_generated_code(
        openapi,
        """
        # Route Schemas
        class GetUsersQuery(BaseModel):
            model_config = ConfigDict(extra='forbid')
            limit: Annotated[float, Field(strict=True)] = None
            offset: Annotated[float, Field(strict=True)] = None

        class GetUsers200Response(RootModel[dict[str, Any]]):
            pass


        GetUsersQuery.model_rebuild()
        GetUsers200Response.model_rebuild()


        Request = {
            '/users': {
                'GET': {
                    'query': GetUsersQuery,
                },
            },
        }

        Response = {
            '/users': {
                'GET': {
                    '200': GetUsers200Response,
                },
            },
        }
        """,
        options={"include_routes": True},
    )


def test_no_routes_when_disabled() -> None:
    openapi = {
        "components": {"schemas": {}},
        "paths": {
            "/users": {
                "get": {
                    "responses": {
                        "200": {
                            "content": {
                                "application/json": {"schema": {"type": "object", "properties": {}}}
                            }
                        }
                    }
                }
            }
        },
    }

    assert_generated_code(openapi, "", options={"include_routes": False})


def test_headers_with_alias() -> None:
    openapi = {
        "components": {"schemas": {}},
        "paths": {
            "/users": {
                "get": {
                    "parameters": [
                        {
                            "name": "Authorization",
                            "in": "header",
                            "required": True,
                            "schema": {"type": "string"},
                        }
                    ],
                    "responses": {
                        "200": {
                            "content": {
                                "application/json": {"schema": {"type": "object", "properties": {}}}
                            }
                        }
                    },
                }
            }
        },
    }

    assert_generated_code(
        openapi,
        """
        # Route Schemas
        class GetUsersHeaders(BaseModel):
            model_config = ConfigDict(populate_by_name=True, extra='forbid')
            authorization: Annotated[str, Field(strict=True)] = Field(alias='Authorization')

        class GetUsers200Response(RootModel[dict[str, Any]]):
            pass


        GetUsersHeaders.model_rebuild()
        GetUsers200Response.model_rebuild()


        Request = {
            '/users': {
                'GET': {
                    'headers': GetUsersHeaders,
                },
            },
        }

        Response = {
            '/users': {
                'GET': {
                    '200': GetUsers200Response,
                },
            },
        }
        """,
        options={"include_routes": True},
    )


def test_multiple_methods_same_path() -> None:
    openapi = {
        "components": {"schemas": {}},
        "paths": {
            "/users/{id}": {
                "get": {
                    "parameters": [
                        {
                            "name": "id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                        }
                    ],
                    "responses": {
                        "200": {
                            "content": {
                                "application/json": {"schema": {"type": "object", "properties": {}}}
                            }
                        }
                    },
                },
                "delete": {
                    "parameters": [
                        {
                            "name": "id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                        }
                    ],
                    "responses": {
                        "204": {
                            "content": {
                                "application/json": {"schema": {"type": "object", "properties": {}}}
                            }
                        }
                    },
                },
            }
        },
    }

    assert_generated_code(
        openapi,
        """
        # Route Schemas
        class GetUsersId200Response(RootModel[dict[str, Any]]):
            pass

        class GetUsersIdParams(BaseModel):
            model_config = ConfigDict(extra='forbid')
            id: Annotated[str, Field(strict=True)]


        GetUsersId200Response.model_rebuild()
        GetUsersIdParams.model_rebuild()


        Request = {
            '/users/{id}': {
                'GET': {
                    'params': GetUsersIdParams,
                },
                'DELETE': {
                    'params': GetUsersIdParams,
                },
            },
        }

        Response = {
            '/users/{id}': {
                'GET': {
                    '200': GetUsersId200Response,
                },
                'DELETE': {
                    '204': GetUsersId200Response,
                },
            },
        }
        """,
        options={"include_routes": True},
    )


def test_custom_registry_in_code() -> None:
    register_pydantic_type_to_openapi_schema(
        object(),
        {
            "schema_exported_variable_name": "uuid_schema",
            "type": "string",
            "format": "uuid",
            "description": None,
        },
    )
    openapi = {
        "components": {
            "schemas": {
                "User": {
                    "type": "object",
                    "properties": {"id": {"type": "string", "format": "uuid"}},
                    "required": ["id"],
                }
            }
        }
    }

    assert_generated_code(
        openapi,
        """
        class User(BaseModel):
            model_config = ConfigDict(extra='allow')
            id: uuid_schema

        User.model_rebuild()
        """,
    )


def test_deduplicated_error_schemas() -> None:
    unauthorized_error = {
        "type": "object",
        "properties": {
            "error": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "enum": ["UNAUTHORIZED"]},
                    "message": {"type": "string"},
                },
                "required": ["code", "message"],
            }
        },
        "required": ["error"],
    }

    openapi = {
        "components": {"schemas": {}},
        "paths": {
            "/users": {
                "get": {
                    "responses": {
                        "200": {
                            "content": {
                                "application/json": {"schema": {"type": "object", "properties": {}}}
                            }
                        },
                        "401": {"content": {"application/json": {"schema": unauthorized_error}}},
                    }
                },
                "post": {
                    "responses": {
                        "200": {
                            "content": {
                                "application/json": {"schema": {"type": "object", "properties": {}}}
                            }
                        },
                        "401": {"content": {"application/json": {"schema": unauthorized_error}}},
                    }
                },
            }
        },
    }

    assert_generated_code(
        openapi,
        """
        # Route Schemas
        class GetUsers200Response(RootModel[dict[str, Any]]):
            pass

        class UnauthorizedErrorError(BaseModel):
            model_config = ConfigDict(extra='allow')
            code: Literal['UNAUTHORIZED']
            message: Annotated[str, Field(strict=True)]

        class UnauthorizedError(BaseModel):
            model_config = ConfigDict(extra='allow')
            error: UnauthorizedErrorError


        GetUsers200Response.model_rebuild()
        UnauthorizedErrorError.model_rebuild()
        UnauthorizedError.model_rebuild()


        Request = {
            '/users': {
            },
        }

        Response = {
            '/users': {
                'GET': {
                    '200': GetUsers200Response,
                    '401': UnauthorizedError,
                },
                'POST': {
                    '200': GetUsers200Response,
                    '401': UnauthorizedError,
                },
            },
        }
        """,
        options={"include_routes": True},
    )


def test_top_level_map_schema_preserves_value_type() -> None:
    openapi = {
        "components": {
            "schemas": {
                "TagMap": {
                    "type": "object",
                    "additionalProperties": {"type": "string"},
                }
            }
        }
    }

    assert_generated_code(
        openapi,
        """
        class TagMap(RootModel[dict[str, Annotated[str, Field(strict=True)]]]):
            pass

        TagMap.model_rebuild()
        """,
    )


def test_array_of_object_items_preserves_item_shape() -> None:
    openapi = {
        "components": {
            "schemas": {
                "Users": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "name": {"type": "string"},
                        },
                        "required": ["id"],
                    },
                }
            }
        }
    }

    assert_generated_code(
        openapi,
        """
        class UsersItem(BaseModel):
            model_config = ConfigDict(extra='allow')
            id: Annotated[str, Field(strict=True)]
            name: Annotated[str, Field(strict=True)] = None

        class Users(RootModel[list[UsersItem]]):
            pass

        UsersItem.model_rebuild()
        Users.model_rebuild()
        """,
    )


def test_generated_map_model_validates_value_type() -> None:
    openapi = {
        "components": {
            "schemas": {
                "TagMap": {
                    "type": "object",
                    "additionalProperties": {"type": "string"},
                }
            }
        }
    }

    module = _load_module(openapi_to_pydantic_code(openapi))
    model = module.TagMap.model_validate({"primary": "blue"})
    assert model.root == {"primary": "blue"}

    with pytest.raises(ValidationError):
        module.TagMap.model_validate({"primary": 123})


def test_generated_array_item_model_validates_item_shape() -> None:
    openapi = {
        "components": {
            "schemas": {
                "Users": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "name": {"type": "string"},
                        },
                        "required": ["id"],
                    },
                }
            }
        }
    }

    module = _load_module(openapi_to_pydantic_code(openapi))
    model = module.Users.model_validate([{"id": "1"}, {"id": "2", "name": "Ada"}])
    assert len(model.root) == 2

    with pytest.raises(ValidationError):
        module.Users.model_validate([{"name": "missing-id"}])


def test_generated_route_models_validate_requests_and_responses() -> None:
    openapi = {
        "components": {
            "schemas": {
                "User": {
                    "type": "object",
                    "properties": {"id": {"type": "string"}},
                    "required": ["id"],
                }
            }
        },
        "paths": {
            "/users/{id}": {
                "get": {
                    "parameters": [
                        {
                            "name": "id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                        }
                    ],
                    "responses": {
                        "200": {
                            "content": {
                                "application/json": {
                                    "schema": {"$ref": "#/components/schemas/User"}
                                }
                            }
                        }
                    },
                }
            }
        },
    }

    module = _load_module(openapi_to_pydantic_code(openapi, options={"include_routes": True}))
    request_model = module.Request["/users/{id}"]["GET"]["params"]
    response_model = module.Response["/users/{id}"]["GET"]["200"]

    assert request_model.model_validate({"id": "123"}).id == "123"
    assert response_model.model_validate({"id": "123"}).id == "123"

    with pytest.raises(ValidationError):
        request_model.model_validate({"id": "123", "extra": True})


def test_generated_custom_registry_type_validates() -> None:
    register_pydantic_type_to_openapi_schema(
        object(),
        {
            "schema_exported_variable_name": "uuid_schema",
            "type": "string",
            "format": "uuid",
            "description": None,
        },
    )
    openapi = {
        "components": {
            "schemas": {
                "User": {
                    "type": "object",
                    "properties": {"id": {"type": "string", "format": "uuid"}},
                    "required": ["id"],
                }
            }
        }
    }

    module = _load_module(
        openapi_to_pydantic_code(
            openapi,
            custom_import_lines=["from uuid import UUID as uuid_schema"],
        )
    )
    model = module.User.model_validate({"id": "12345678-1234-5678-1234-567812345678"})
    assert model.id == UUID("12345678-1234-5678-1234-567812345678")

    with pytest.raises(ValidationError):
        module.User.model_validate({"id": "not-a-uuid"})

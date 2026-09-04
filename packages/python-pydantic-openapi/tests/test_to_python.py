from __future__ import annotations

import importlib.util
import types
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import UUID

import pytest
from pydantic import ValidationError

from alt_stack.pydantic_openapi.registry import (
    clear_pydantic_schema_registry,
    register_pydantic_type_to_openapi_schema,
)
from alt_stack.pydantic_openapi.to_python import openapi_to_pydantic_code
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


        _GetUsersIdRequest = TypedDict('_GetUsersIdRequest', {
            'params': type[GetUsersIdParams],
        })
        _UsersIdRequestMethods = TypedDict('_UsersIdRequestMethods', {
            'GET': _GetUsersIdRequest,
        })
        _RequestMap = TypedDict('_RequestMap', {
            '/users/{id}': _UsersIdRequestMethods,
        })

        Request: Final[_RequestMap] = {
            '/users/{id}': {
                'GET': {
                    'params': GetUsersIdParams,
                },
            },
        }

        _GetUsersIdResponse = TypedDict('_GetUsersIdResponse', {
            '200': type[User],
        })
        _UsersIdResponseMethods = TypedDict('_UsersIdResponseMethods', {
            'GET': _GetUsersIdResponse,
        })
        _ResponseMap = TypedDict('_ResponseMap', {
            '/users/{id}': _UsersIdResponseMethods,
        })

        Response: Final[_ResponseMap] = {
            '/users/{id}': {
                'GET': {
                    '200': User,
                },
            },
        }

        # Typed Client
        GetUsersIdResult = Union[
            _client.ApiSuccess[Literal['200'], User],
            _client.ApiUnexpectedError,
        ]

        # Typed route methods; construct HttpxApiClient(url, request_map=Request,
        # response_map=Response) or ApiClient(url, transport=..., request_map=..., ...).
        class ApiClient(_client.BaseApiClient):
            async def get(
                self,
                path: Literal['/users/{id}'],
                *,
                params: GetUsersIdParams,
                options: _client.RequestOptions | None = None,
            ) -> GetUsersIdResult:
                return cast(
                    GetUsersIdResult,
                    await self.request('GET', path, params=params, options=options),
                )

        class HttpxApiClient(ApiClient, _client.HttpxApiClient):
            pass
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
            limit: Annotated[Optional[Annotated[float, Field(strict=True)]], _omit_not_null] = None
            offset: Annotated[Optional[Annotated[float, Field(strict=True)]], _omit_not_null] = None

        class GetUsers200Response(RootModel[dict[str, Any]]):
            pass


        GetUsersQuery.model_rebuild()
        GetUsers200Response.model_rebuild()


        _GetUsersRequest = TypedDict('_GetUsersRequest', {
            'query': type[GetUsersQuery],
        })
        _UsersRequestMethods = TypedDict('_UsersRequestMethods', {
            'GET': _GetUsersRequest,
        })
        _RequestMap = TypedDict('_RequestMap', {
            '/users': _UsersRequestMethods,
        })

        Request: Final[_RequestMap] = {
            '/users': {
                'GET': {
                    'query': GetUsersQuery,
                },
            },
        }

        _GetUsersResponse = TypedDict('_GetUsersResponse', {
            '200': type[GetUsers200Response],
        })
        _UsersResponseMethods = TypedDict('_UsersResponseMethods', {
            'GET': _GetUsersResponse,
        })
        _ResponseMap = TypedDict('_ResponseMap', {
            '/users': _UsersResponseMethods,
        })

        Response: Final[_ResponseMap] = {
            '/users': {
                'GET': {
                    '200': GetUsers200Response,
                },
            },
        }

        # Typed Client
        GetUsersResult = Union[
            _client.ApiSuccess[Literal['200'], GetUsers200Response],
            _client.ApiUnexpectedError,
        ]

        # Typed route methods; construct HttpxApiClient(url, request_map=Request,
        # response_map=Response) or ApiClient(url, transport=..., request_map=..., ...).
        class ApiClient(_client.BaseApiClient):
            async def get(
                self,
                path: Literal['/users'],
                *,
                query: GetUsersQuery | None = None,
                options: _client.RequestOptions | None = None,
            ) -> GetUsersResult:
                return cast(
                    GetUsersResult,
                    await self.request('GET', path, query=query, options=options),
                )

        class HttpxApiClient(ApiClient, _client.HttpxApiClient):
            pass
        """,
        options={"include_routes": True},
    )


def test_optional_non_nullable_fields_reject_explicit_none() -> None:
    openapi = {
        "components": {
            "schemas": {
                "Item": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "x-rate-limit": {"type": "integer"},
                        "description": {"type": "string", "nullable": True},
                    },
                }
            }
        }
    }

    module = _load_module(openapi_to_pydantic_code(openapi))
    item = module.Item.model_validate({})

    assert item.name is None
    assert item.x_rate_limit is None
    assert item.description is None
    with pytest.raises(ValidationError):
        module.Item.model_validate({"name": None})
    with pytest.raises(ValidationError):
        module.Item.model_validate({"x-rate-limit": None})
    module.Item.model_validate({"description": None})


def test_allof_wrapper_around_root_model_imports() -> None:
    openapi = {
        "components": {
            "schemas": {
                "Freeform": {
                    "type": "object",
                    "properties": {},
                }
            }
        },
        "paths": {
            "/items": {
                "get": {
                    "parameters": [
                        {
                            "name": "filter",
                            "in": "query",
                            "required": False,
                            "schema": {"allOf": [{"$ref": "#/components/schemas/Freeform"}]},
                        }
                    ]
                }
            }
        },
    }

    code = openapi_to_pydantic_code(openapi, options={"include_routes": True})
    assert "class GetItemsQueryFilter(RootModel[Freeform]):" in code

    module = _load_module(code)
    query_model = module.Request["/items"]["GET"]["query"]
    query = query_model.model_validate({"filter": {"status": "active"}})

    assert query.filter.root.root == {"status": "active"}


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


        _GetUsersRequest = TypedDict('_GetUsersRequest', {
            'headers': type[GetUsersHeaders],
        })
        _UsersRequestMethods = TypedDict('_UsersRequestMethods', {
            'GET': _GetUsersRequest,
        })
        _RequestMap = TypedDict('_RequestMap', {
            '/users': _UsersRequestMethods,
        })

        Request: Final[_RequestMap] = {
            '/users': {
                'GET': {
                    'headers': GetUsersHeaders,
                },
            },
        }

        _GetUsersResponse = TypedDict('_GetUsersResponse', {
            '200': type[GetUsers200Response],
        })
        _UsersResponseMethods = TypedDict('_UsersResponseMethods', {
            'GET': _GetUsersResponse,
        })
        _ResponseMap = TypedDict('_ResponseMap', {
            '/users': _UsersResponseMethods,
        })

        Response: Final[_ResponseMap] = {
            '/users': {
                'GET': {
                    '200': GetUsers200Response,
                },
            },
        }

        # Typed Client
        GetUsersResult = Union[
            _client.ApiSuccess[Literal['200'], GetUsers200Response],
            _client.ApiUnexpectedError,
        ]

        # Typed route methods; construct HttpxApiClient(url, request_map=Request,
        # response_map=Response) or ApiClient(url, transport=..., request_map=..., ...).
        class ApiClient(_client.BaseApiClient):
            async def get(
                self,
                path: Literal['/users'],
                *,
                options: _client.RequestOptions | None = None,
            ) -> GetUsersResult:
                return cast(
                    GetUsersResult,
                    await self.request('GET', path, options=options),
                )

        class HttpxApiClient(ApiClient, _client.HttpxApiClient):
            pass
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


        _GetUsersIdRequest = TypedDict('_GetUsersIdRequest', {
            'params': type[GetUsersIdParams],
        })
        _DeleteUsersIdRequest = TypedDict('_DeleteUsersIdRequest', {
            'params': type[GetUsersIdParams],
        })
        _UsersIdRequestMethods = TypedDict('_UsersIdRequestMethods', {
            'GET': _GetUsersIdRequest,
            'DELETE': _DeleteUsersIdRequest,
        })
        _RequestMap = TypedDict('_RequestMap', {
            '/users/{id}': _UsersIdRequestMethods,
        })

        Request: Final[_RequestMap] = {
            '/users/{id}': {
                'GET': {
                    'params': GetUsersIdParams,
                },
                'DELETE': {
                    'params': GetUsersIdParams,
                },
            },
        }

        _GetUsersIdResponse = TypedDict('_GetUsersIdResponse', {
            '200': type[GetUsersId200Response],
        })
        _DeleteUsersIdResponse = TypedDict('_DeleteUsersIdResponse', {
            '204': type[GetUsersId200Response],
        })
        _UsersIdResponseMethods = TypedDict('_UsersIdResponseMethods', {
            'GET': _GetUsersIdResponse,
            'DELETE': _DeleteUsersIdResponse,
        })
        _ResponseMap = TypedDict('_ResponseMap', {
            '/users/{id}': _UsersIdResponseMethods,
        })

        Response: Final[_ResponseMap] = {
            '/users/{id}': {
                'GET': {
                    '200': GetUsersId200Response,
                },
                'DELETE': {
                    '204': GetUsersId200Response,
                },
            },
        }

        # Typed Client
        GetUsersIdResult = Union[
            _client.ApiSuccess[Literal['200'], GetUsersId200Response],
            _client.ApiUnexpectedError,
        ]
        DeleteUsersIdResult = Union[
            _client.ApiSuccess[Literal['204'], GetUsersId200Response],
            _client.ApiUnexpectedError,
        ]

        # Typed route methods; construct HttpxApiClient(url, request_map=Request,
        # response_map=Response) or ApiClient(url, transport=..., request_map=..., ...).
        class ApiClient(_client.BaseApiClient):
            async def get(
                self,
                path: Literal['/users/{id}'],
                *,
                params: GetUsersIdParams,
                options: _client.RequestOptions | None = None,
            ) -> GetUsersIdResult:
                return cast(
                    GetUsersIdResult,
                    await self.request('GET', path, params=params, options=options),
                )

            async def delete(
                self,
                path: Literal['/users/{id}'],
                *,
                params: GetUsersIdParams,
                options: _client.RequestOptions | None = None,
            ) -> DeleteUsersIdResult:
                return cast(
                    DeleteUsersIdResult,
                    await self.request('DELETE', path, params=params, options=options),
                )

        class HttpxApiClient(ApiClient, _client.HttpxApiClient):
            pass
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


        _GetUsersRequest = TypedDict('_GetUsersRequest', {})
        _PostUsersRequest = TypedDict('_PostUsersRequest', {})
        _UsersRequestMethods = TypedDict('_UsersRequestMethods', {
            'GET': _GetUsersRequest,
            'POST': _PostUsersRequest,
        })
        _RequestMap = TypedDict('_RequestMap', {
            '/users': _UsersRequestMethods,
        })

        Request: Final[_RequestMap] = {
            '/users': {
                'GET': {},
                'POST': {},
            },
        }

        _GetUsersResponse = TypedDict('_GetUsersResponse', {
            '200': type[GetUsers200Response],
            '401': type[UnauthorizedError],
        })
        _PostUsersResponse = TypedDict('_PostUsersResponse', {
            '200': type[GetUsers200Response],
            '401': type[UnauthorizedError],
        })
        _UsersResponseMethods = TypedDict('_UsersResponseMethods', {
            'GET': _GetUsersResponse,
            'POST': _PostUsersResponse,
        })
        _ResponseMap = TypedDict('_ResponseMap', {
            '/users': _UsersResponseMethods,
        })

        Response: Final[_ResponseMap] = {
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

        # Typed Client
        GetUsersResult = Union[
            _client.ApiSuccess[Literal['200'], GetUsers200Response],
            _client.ApiFailure[Literal['401'], UnauthorizedError],
            _client.ApiUnexpectedError,
        ]
        PostUsersResult = Union[
            _client.ApiSuccess[Literal['200'], GetUsers200Response],
            _client.ApiFailure[Literal['401'], UnauthorizedError],
            _client.ApiUnexpectedError,
        ]

        # Typed route methods; construct HttpxApiClient(url, request_map=Request,
        # response_map=Response) or ApiClient(url, transport=..., request_map=..., ...).
        class ApiClient(_client.BaseApiClient):
            async def get(
                self,
                path: Literal['/users'],
                *,
                options: _client.RequestOptions | None = None,
            ) -> GetUsersResult:
                return cast(
                    GetUsersResult,
                    await self.request('GET', path, options=options),
                )

            async def post(
                self,
                path: Literal['/users'],
                *,
                options: _client.RequestOptions | None = None,
            ) -> PostUsersResult:
                return cast(
                    PostUsersResult,
                    await self.request('POST', path, options=options),
                )

        class HttpxApiClient(ApiClient, _client.HttpxApiClient):
            pass
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
            name: Annotated[Optional[Annotated[str, Field(strict=True)]], _omit_not_null] = None

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


def test_intersection_helper_is_inlined_only_when_used() -> None:
    openapi = {
        "components": {
            "schemas": {
                "Code": {"allOf": [{"type": "string", "minLength": 2}, {"type": "string"}]},
            }
        },
        "paths": {},
    }

    code = openapi_to_pydantic_code(openapi, options={"include_routes": True})
    assert "def all_of(*types: Any) -> Any:" in code
    assert "import alt_stack.pydantic_openapi" not in code

    module = _load_module(code)
    assert module.Code.model_validate("ok").root == "ok"
    with pytest.raises(ValidationError):
        module.Code.model_validate("x")

    plain = openapi_to_pydantic_code({"components": {"schemas": {}}, "paths": {}})
    assert "def all_of" not in plain

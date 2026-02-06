from __future__ import annotations

from python_zod_openapi.registry import clear_pydantic_schema_registry
from tests.codegen_assertions import assert_generated_code


def setup_function() -> None:
    clear_pydantic_schema_registry()


def test_routes_request_response_objects() -> None:
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
            id: Annotated[str, Field(strict=True)]
            name: Annotated[str, Field(strict=True)]
        User.model_rebuild()
        UserSchema = TypeAdapter(User)

        # Route Schemas
        class GetUsersIdParams(BaseModel):
            id: Annotated[str, Field(strict=True)]
        GetUsersIdParams.model_rebuild()
        GetUsersIdParamsSchema = TypeAdapter(GetUsersIdParams)

        GetUsersId200Response: TypeAlias = User
        GetUsersId200ResponseSchema = TypeAdapter(GetUsersId200Response)


        Request = {
            '/users/{id}': {
                'GET': {
                    'params': GetUsersIdParamsSchema,
                },
            },
        }

        Response = {
            '/users/{id}': {
                'GET': {
                    '200': GetUsersId200ResponseSchema,
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


def test_query_params_optional() -> None:
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
            limit: Annotated[float, Field(strict=True)] = None
            offset: Annotated[float, Field(strict=True)] = None
        GetUsersQuery.model_rebuild()
        GetUsersQuerySchema = TypeAdapter(GetUsersQuery)

        GetUsers200Response: TypeAlias = dict[str, Any]
        GetUsers200ResponseSchema = TypeAdapter(GetUsers200Response)


        Request = {
            '/users': {
                'GET': {
                    'query': GetUsersQuerySchema,
                },
            },
        }

        Response = {
            '/users': {
                'GET': {
                    '200': GetUsers200ResponseSchema,
                },
            },
        }
        """,
        options={"include_routes": True},
    )


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
            model_config = ConfigDict(populate_by_name=True)
            authorization: Annotated[str, Field(strict=True)] = Field(alias='Authorization')
        GetUsersHeaders.model_rebuild()
        GetUsersHeadersSchema = TypeAdapter(GetUsersHeaders)

        GetUsers200Response: TypeAlias = dict[str, Any]
        GetUsers200ResponseSchema = TypeAdapter(GetUsers200Response)


        Request = {
            '/users': {
                'GET': {
                    'headers': GetUsersHeadersSchema,
                },
            },
        }

        Response = {
            '/users': {
                'GET': {
                    '200': GetUsers200ResponseSchema,
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
        # Common Error Schemas (deduplicated)
        GetUsersId200Response: TypeAlias = dict[str, Any]
        GetUsersId200ResponseSchema = TypeAdapter(GetUsersId200Response)


        # Route Schemas
        class GetUsersIdParams(BaseModel):
            id: Annotated[str, Field(strict=True)]
        GetUsersIdParams.model_rebuild()
        GetUsersIdParamsSchema = TypeAdapter(GetUsersIdParams)

        DeleteUsersIdParams = GetUsersIdParams
        DeleteUsersIdParamsSchema = GetUsersIdParamsSchema

        DeleteUsersId204Response = GetUsersId200Response
        DeleteUsersId204ResponseSchema = GetUsersId200ResponseSchema


        Request = {
            '/users/{id}': {
                'GET': {
                    'params': GetUsersIdParamsSchema,
                },
                'DELETE': {
                    'params': GetUsersIdParamsSchema,
                },
            },
        }

        Response = {
            '/users/{id}': {
                'GET': {
                    '200': GetUsersId200ResponseSchema,
                },
                'DELETE': {
                    '204': GetUsersId200ResponseSchema,
                },
            },
        }
        """,
        options={"include_routes": True},
    )


def test_dedup_common_error_responses() -> None:
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
        # Common Error Schemas (deduplicated)
        GetUsers200Response: TypeAlias = dict[str, Any]
        GetUsers200ResponseSchema = TypeAdapter(GetUsers200Response)

        class UnauthorizedErrorError(BaseModel):
            code: Literal['UNAUTHORIZED']
            message: Annotated[str, Field(strict=True)]
        UnauthorizedErrorError.model_rebuild()
        UnauthorizedErrorErrorSchema = TypeAdapter(UnauthorizedErrorError)

        class UnauthorizedError(BaseModel):
            error: UnauthorizedErrorError
        UnauthorizedError.model_rebuild()
        UnauthorizedErrorSchema = TypeAdapter(UnauthorizedError)


        # Route Schemas
        GetUsers401ErrorResponse = UnauthorizedError
        GetUsers401ErrorResponseSchema = UnauthorizedErrorSchema

        PostUsers200Response = GetUsers200Response
        PostUsers200ResponseSchema = GetUsers200ResponseSchema

        PostUsers401ErrorResponse = UnauthorizedError
        PostUsers401ErrorResponseSchema = UnauthorizedErrorSchema


        Request = {
        }

        Response = {
            '/users': {
                'GET': {
                    '200': GetUsers200ResponseSchema,
                    '401': UnauthorizedErrorSchema,
                },
                'POST': {
                    '200': GetUsers200ResponseSchema,
                    '401': UnauthorizedErrorSchema,
                },
            },
        }
        """,
        options={"include_routes": True},
    )

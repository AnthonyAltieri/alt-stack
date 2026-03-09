import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import * as ts from "typescript";
import { openApiToZodTsCode } from "./to-typescript";
import type { AnySchema } from "./types/types";

function normalizeSpacing(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
}

function sortKeysDeep(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);

  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeysDeep(obj[key]);
  }
  return sorted;
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value), null, 2);
}

// These are intentionally embedded as human-readable full outputs (not snapshots).
const EXPECTED_ZOD_TS = String.raw`
/**
 * This file was automatically generated from OpenAPI schema
 * Do not manually edit this file
 */

import { z } from 'zod';

// Type assertion helper - verifies interface matches schema at compile time
type _AssertEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : never) : never;

export type ScalarString = string;
export const ScalarStringSchema = z.string();

export type StringEmail = string;
export const StringEmailSchema = z.string().email().meta({"openapi":{"format":"email"}});

export type StringUrl = string;
export const StringUrlSchema = z.string().url().meta({"openapi":{"format":"url"}});

export type StringUri = string;
export const StringUriSchema = z.string().url().meta({"openapi":{"format":"uri"}});

export type StringUuid = string;
export const StringUuidSchema = z.string().uuid().meta({"openapi":{"format":"uuid"}});

export type StringColorHex = string;
export const StringColorHexSchema = z.string().regex(/^[a-fA-F0-9]{6}$/).meta({"openapi":{"format":"color-hex"}});

export type StringPattern = string;
export const StringPatternSchema = z.string().regex(/^[a-z]+$/).meta({"openapi":{"pattern":"^[a-z]+$"}});

export type StringMinMax = string;
export const StringMinMaxSchema = z.string().min(2).max(5);

export type StringAllConstraints = string;
export const StringAllConstraintsSchema = z.string().email().min(6).max(50).regex(/.*@example\.com$/).meta({"openapi":{"format":"email","pattern":".*@example\\.com$"}});

export type StringEnum = "red" | "green" | "blue";
export const StringEnumSchema = z.enum(['red', 'green', 'blue']);

export type NumberMinMax = number;
export const NumberMinMaxSchema = z.number().min(0).max(10);

export type IntegerMinMax = number;
export const IntegerMinMaxSchema = z.number().int().min(1).max(100);

export type ScalarBoolean = boolean;
export const ScalarBooleanSchema = z.boolean();

export type ArrayOfStrings = Array<string>;
export const ArrayOfStringsSchema = z.array(z.string()).min(1).max(3);

export type ArrayOfUnion = Array<(string | number)>;
export const ArrayOfUnionSchema = z.array(z.union([z.string(), z.number()]));

export interface ObjectOptionalAndNullable {
  name: string;
  nickname?: (string | null);
  'x-rate-limit'?: number;
}
export const ObjectOptionalAndNullableSchema = z.object({ name: z.string().min(1), nickname: z.string().nullable().optional(), 'x-rate-limit': z.number().int().min(0).optional() });

export interface EmptyObjectStrict {
}
export const EmptyObjectStrictSchema = z.object({}).strict();

export interface FreeformObject {
}
export const FreeformObjectSchema = z.record(z.string(), z.unknown());

export interface Named {
  name: string;
}
export const NamedSchema = z.object({ name: z.string().min(1) });

export interface Timestamped {
  createdAt: string;
  updatedAt?: (string | null);
}
export const TimestampedSchema = z.object({ createdAt: z.string().datetime().meta({"openapi":{"format":"date-time"}}), updatedAt: z.string().datetime().meta({"openapi":{"format":"date-time"}}).nullable().optional() });

export interface Audited {
  createdBy: string;
  updatedBy?: (string | null);
}
export const AuditedSchema = z.object({ createdBy: z.string().min(1), updatedBy: z.string().nullable().optional() });

export interface Cat {
  kind: "cat";
  meows: boolean;
}
export const CatSchema = z.object({ kind: z.enum(['cat']), meows: z.boolean() }).strict();

export interface Dog {
  kind: "dog";
  barks: boolean;
}
export const DogSchema = z.object({ kind: z.enum(['dog']), barks: z.boolean() }).strict();

export interface UnauthorizedError {
  error: { code: "UNAUTHORIZED"; message: string };
}
export const UnauthorizedErrorSchema = z.object({ error: z.object({ code: z.enum(['UNAUTHORIZED']), message: z.string().min(1) }).strict() }).strict();

export interface NotFoundError {
  error: { code: "NOT_FOUND"; message: string };
}
export const NotFoundErrorSchema = z.object({ error: z.object({ code: z.enum(['NOT_FOUND']), message: z.string().min(1) }).strict() }).strict();

export interface ValidationError {
  error: { code: "VALIDATION_ERROR"; message: string };
  details?: Array<string>;
}
export const ValidationErrorSchema = z.object({ error: z.object({ code: z.enum(['VALIDATION_ERROR']), message: z.string().min(1) }).strict(), details: z.array(z.string()).optional() }).strict();

export interface Profile {
  bio: string;
  website?: (StringUrl | null);
  location?: (string | null);
}
export const ProfileSchema = z.object({ bio: z.string().max(160), website: StringUrlSchema.nullable().optional(), location: z.string().nullable().optional() }).strict();

export type ArrayOfUuids = Array<StringUuid>;
export const ArrayOfUuidsSchema = z.array(StringUuidSchema);

export interface ImplicitObject {
  id: StringUuid;
}
export const ImplicitObjectSchema = z.object({ id: StringUuidSchema }).strict();

export interface ObjectSimple {
  id: StringUuid;
  count?: IntegerMinMax;
}
export const ObjectSimpleSchema = z.object({ id: StringUuidSchema, count: IntegerMinMaxSchema.optional() });

export type NamedTimestamped = (Named & Timestamped);
export const NamedTimestampedSchema = z.intersection(NamedSchema, TimestampedSchema);

export type FullAuditRecord = (Named & Timestamped & Audited);
export const FullAuditRecordSchema = z.intersection(z.intersection(NamedSchema, TimestampedSchema), AuditedSchema);

export type Pet = (Cat | Dog);
export const PetSchema = z.union([CatSchema, DogSchema]);

export interface CreateUser {
  name: string;
  email: StringEmail;
  profile?: (Profile | null);
}
export const CreateUserSchema = z.object({ name: z.string().min(1), email: StringEmailSchema, profile: ProfileSchema.nullable().optional() }).strict();

export interface User {
  id: StringUuid;
  name: string;
  email: StringEmail;
  roles: Array<StringEnum>;
  profile?: (Profile | null);
}
export const UserSchema = z.object({ id: StringUuidSchema, name: z.string().min(1), email: StringEmailSchema, roles: z.array(StringEnumSchema).min(1), profile: ProfileSchema.nullable().optional() }).strict();

export interface PetAdoptedEvent {
  eventType: "pet.adopted";
  data: Pet;
}
export const PetAdoptedEventSchema = z.object({ eventType: z.enum(['pet.adopted']), data: PetSchema }).strict();

export interface UserCreatedEvent {
  eventType: "user.created";
  data: User;
}
export const UserCreatedEventSchema = z.object({ eventType: z.enum(['user.created']), data: UserSchema }).strict();

export type NullableUser = (User | null);
export const NullableUserSchema = UserSchema.nullable();

export type Event = (UserCreatedEvent | PetAdoptedEvent);
export const EventSchema = z.union([UserCreatedEventSchema, PetAdoptedEventSchema]);

// Compile-time type assertions - ensure interfaces match schemas
type _AssertScalarString = _AssertEqual<ScalarString, z.infer<typeof ScalarStringSchema>>;
type _AssertStringEmail = _AssertEqual<StringEmail, z.infer<typeof StringEmailSchema>>;
type _AssertStringUrl = _AssertEqual<StringUrl, z.infer<typeof StringUrlSchema>>;
type _AssertStringUri = _AssertEqual<StringUri, z.infer<typeof StringUriSchema>>;
type _AssertStringUuid = _AssertEqual<StringUuid, z.infer<typeof StringUuidSchema>>;
type _AssertStringColorHex = _AssertEqual<StringColorHex, z.infer<typeof StringColorHexSchema>>;
type _AssertStringPattern = _AssertEqual<StringPattern, z.infer<typeof StringPatternSchema>>;
type _AssertStringMinMax = _AssertEqual<StringMinMax, z.infer<typeof StringMinMaxSchema>>;
type _AssertStringAllConstraints = _AssertEqual<StringAllConstraints, z.infer<typeof StringAllConstraintsSchema>>;
type _AssertStringEnum = _AssertEqual<StringEnum, z.infer<typeof StringEnumSchema>>;
type _AssertNumberMinMax = _AssertEqual<NumberMinMax, z.infer<typeof NumberMinMaxSchema>>;
type _AssertIntegerMinMax = _AssertEqual<IntegerMinMax, z.infer<typeof IntegerMinMaxSchema>>;
type _AssertScalarBoolean = _AssertEqual<ScalarBoolean, z.infer<typeof ScalarBooleanSchema>>;
type _AssertArrayOfStrings = _AssertEqual<ArrayOfStrings, z.infer<typeof ArrayOfStringsSchema>>;
type _AssertArrayOfUnion = _AssertEqual<ArrayOfUnion, z.infer<typeof ArrayOfUnionSchema>>;
type _AssertObjectOptionalAndNullable = _AssertEqual<ObjectOptionalAndNullable, z.infer<typeof ObjectOptionalAndNullableSchema>>;
type _AssertEmptyObjectStrict = _AssertEqual<EmptyObjectStrict, z.infer<typeof EmptyObjectStrictSchema>>;
type _AssertFreeformObject = _AssertEqual<FreeformObject, z.infer<typeof FreeformObjectSchema>>;
type _AssertNamed = _AssertEqual<Named, z.infer<typeof NamedSchema>>;
type _AssertTimestamped = _AssertEqual<Timestamped, z.infer<typeof TimestampedSchema>>;
type _AssertAudited = _AssertEqual<Audited, z.infer<typeof AuditedSchema>>;
type _AssertCat = _AssertEqual<Cat, z.infer<typeof CatSchema>>;
type _AssertDog = _AssertEqual<Dog, z.infer<typeof DogSchema>>;
type _AssertUnauthorizedError = _AssertEqual<UnauthorizedError, z.infer<typeof UnauthorizedErrorSchema>>;
type _AssertNotFoundError = _AssertEqual<NotFoundError, z.infer<typeof NotFoundErrorSchema>>;
type _AssertValidationError = _AssertEqual<ValidationError, z.infer<typeof ValidationErrorSchema>>;
type _AssertProfile = _AssertEqual<Profile, z.infer<typeof ProfileSchema>>;
type _AssertArrayOfUuids = _AssertEqual<ArrayOfUuids, z.infer<typeof ArrayOfUuidsSchema>>;
type _AssertImplicitObject = _AssertEqual<ImplicitObject, z.infer<typeof ImplicitObjectSchema>>;
type _AssertObjectSimple = _AssertEqual<ObjectSimple, z.infer<typeof ObjectSimpleSchema>>;
type _AssertNamedTimestamped = _AssertEqual<NamedTimestamped, z.infer<typeof NamedTimestampedSchema>>;
type _AssertFullAuditRecord = _AssertEqual<FullAuditRecord, z.infer<typeof FullAuditRecordSchema>>;
type _AssertPet = _AssertEqual<Pet, z.infer<typeof PetSchema>>;
type _AssertCreateUser = _AssertEqual<CreateUser, z.infer<typeof CreateUserSchema>>;
type _AssertUser = _AssertEqual<User, z.infer<typeof UserSchema>>;
type _AssertPetAdoptedEvent = _AssertEqual<PetAdoptedEvent, z.infer<typeof PetAdoptedEventSchema>>;
type _AssertUserCreatedEvent = _AssertEqual<UserCreatedEvent, z.infer<typeof UserCreatedEventSchema>>;
type _AssertNullableUser = _AssertEqual<NullableUser, z.infer<typeof NullableUserSchema>>;
type _AssertEvent = _AssertEqual<Event, z.infer<typeof EventSchema>>;

// Common Error Schemas (deduplicated)
export const GetUsersId401ErrorResponse = UnauthorizedErrorSchema;
export const GetUsersId200Response = UserSchema;

// Route Schemas
export const GetUsersIdParams = z.object({ id: z.string().uuid().meta({"openapi":{"format":"uuid"}}) });
export const GetUsersIdQuery = z.object({ includeProfile: z.boolean().optional() });
export const GetUsersIdHeaders = z.object({ 'x-trace-id': z.string().min(8) });
export const GetUsersId404ErrorResponse = NotFoundErrorSchema;
export const PostUsersBody = CreateUserSchema;
export const PostUsers201Response = GetUsersId200Response;
export const PostUsers400ErrorResponse = ValidationErrorSchema;
export const PostUsers401ErrorResponse = GetUsersId401ErrorResponse;
export const GetPets200Response = PetSchema;
export const GetPets401ErrorResponse = GetUsersId401ErrorResponse;
export const GetStats200Response = z.object({ count: z.number().int().min(0) }).strict();
export const GetStats401ErrorResponse = GetUsersId401ErrorResponse;

export const Request = {
  '/users/{id}': {
    GET: {
      params: GetUsersIdParams,
      query: GetUsersIdQuery,
      headers: GetUsersIdHeaders,
    },
  },
  '/users': {
    POST: {
      body: PostUsersBody,
    },
  },
} as const;

export const Response = {
  '/users/{id}': {
    GET: {
      '200': GetUsersId200Response,
      '401': GetUsersId401ErrorResponse,
      '404': GetUsersId404ErrorResponse,
    },
  },
  '/users': {
    POST: {
      '201': GetUsersId200Response,
      '400': PostUsers400ErrorResponse,
      '401': GetUsersId401ErrorResponse,
    },
  },
  '/pets': {
    GET: {
      '200': GetPets200Response,
      '401': GetUsersId401ErrorResponse,
    },
  },
  '/stats': {
    GET: {
      '200': GetStats200Response,
      '401': GetUsersId401ErrorResponse,
    },
  },
} as const;
`;

const EXPECTED_OPENAPI_JSON = String.raw`
{
  "components": {
    "schemas": {
      "ArrayOfStrings": {
        "items": {
          "type": "string"
        },
        "maxItems": 3,
        "minItems": 1,
        "type": "array"
      },
      "ArrayOfUnion": {
        "items": {
          "oneOf": [
            {
              "type": "string"
            },
            {
              "type": "number"
            }
          ]
        },
        "type": "array"
      },
      "ArrayOfUuids": {
        "items": {
          "$ref": "#/components/schemas/StringUuid"
        },
        "type": "array"
      },
      "Audited": {
        "properties": {
          "createdBy": {
            "minLength": 1,
            "type": "string"
          },
          "updatedBy": {
            "nullable": true,
            "type": "string"
          }
        },
        "required": [
          "createdBy"
        ],
        "type": "object"
      },
      "Cat": {
        "additionalProperties": false,
        "properties": {
          "kind": {
            "enum": [
              "cat"
            ],
            "type": "string"
          },
          "meows": {
            "type": "boolean"
          }
        },
        "required": [
          "kind",
          "meows"
        ],
        "type": "object"
      },
      "CreateUser": {
        "additionalProperties": false,
        "properties": {
          "email": {
            "$ref": "#/components/schemas/StringEmail"
          },
          "name": {
            "minLength": 1,
            "type": "string"
          },
          "profile": {
            "$ref": "#/components/schemas/Profile",
            "nullable": true
          }
        },
        "required": [
          "name",
          "email"
        ],
        "type": "object"
      },
      "Dog": {
        "additionalProperties": false,
        "properties": {
          "barks": {
            "type": "boolean"
          },
          "kind": {
            "enum": [
              "dog"
            ],
            "type": "string"
          }
        },
        "required": [
          "kind",
          "barks"
        ],
        "type": "object"
      },
      "EmptyObjectStrict": {
        "additionalProperties": false,
        "type": "object"
      },
      "Event": {
        "discriminator": {
          "mapping": {
            "pet.adopted": "#/components/schemas/PetAdoptedEvent",
            "user.created": "#/components/schemas/UserCreatedEvent"
          },
          "propertyName": "eventType"
        },
        "oneOf": [
          {
            "$ref": "#/components/schemas/UserCreatedEvent"
          },
          {
            "$ref": "#/components/schemas/PetAdoptedEvent"
          }
        ]
      },
      "FreeformObject": {
        "type": "object"
      },
      "FullAuditRecord": {
        "allOf": [
          {
            "$ref": "#/components/schemas/Named"
          },
          {
            "$ref": "#/components/schemas/Timestamped"
          },
          {
            "$ref": "#/components/schemas/Audited"
          }
        ]
      },
      "ImplicitObject": {
        "additionalProperties": false,
        "properties": {
          "id": {
            "$ref": "#/components/schemas/StringUuid"
          }
        },
        "required": [
          "id"
        ],
        "type": "object"
      },
      "IntegerMinMax": {
        "maximum": 100,
        "minimum": 1,
        "type": "integer"
      },
      "Named": {
        "properties": {
          "name": {
            "minLength": 1,
            "type": "string"
          }
        },
        "required": [
          "name"
        ],
        "type": "object"
      },
      "NamedTimestamped": {
        "allOf": [
          {
            "$ref": "#/components/schemas/Named"
          },
          {
            "$ref": "#/components/schemas/Timestamped"
          }
        ]
      },
      "NotFoundError": {
        "additionalProperties": false,
        "properties": {
          "error": {
            "additionalProperties": false,
            "properties": {
              "code": {
                "enum": [
                  "NOT_FOUND"
                ],
                "type": "string"
              },
              "message": {
                "minLength": 1,
                "type": "string"
              }
            },
            "required": [
              "code",
              "message"
            ],
            "type": "object"
          }
        },
        "required": [
          "error"
        ],
        "type": "object"
      },
      "NullableUser": {
        "$ref": "#/components/schemas/User",
        "nullable": true
      },
      "NumberMinMax": {
        "maximum": 10,
        "minimum": 0,
        "type": "number"
      },
      "ObjectOptionalAndNullable": {
        "properties": {
          "name": {
            "minLength": 1,
            "type": "string"
          },
          "nickname": {
            "nullable": true,
            "type": "string"
          },
          "x-rate-limit": {
            "minimum": 0,
            "type": "integer"
          }
        },
        "required": [
          "name"
        ],
        "type": "object"
      },
      "ObjectSimple": {
        "properties": {
          "count": {
            "$ref": "#/components/schemas/IntegerMinMax"
          },
          "id": {
            "$ref": "#/components/schemas/StringUuid"
          }
        },
        "required": [
          "id"
        ],
        "type": "object"
      },
      "Pet": {
        "discriminator": {
          "mapping": {
            "cat": "#/components/schemas/Cat",
            "dog": "#/components/schemas/Dog"
          },
          "propertyName": "kind"
        },
        "oneOf": [
          {
            "$ref": "#/components/schemas/Cat"
          },
          {
            "$ref": "#/components/schemas/Dog"
          }
        ]
      },
      "PetAdoptedEvent": {
        "additionalProperties": false,
        "properties": {
          "data": {
            "$ref": "#/components/schemas/Pet"
          },
          "eventType": {
            "enum": [
              "pet.adopted"
            ],
            "type": "string"
          }
        },
        "required": [
          "eventType",
          "data"
        ],
        "type": "object"
      },
      "Profile": {
        "additionalProperties": false,
        "properties": {
          "bio": {
            "maxLength": 160,
            "type": "string"
          },
          "location": {
            "nullable": true,
            "type": "string"
          },
          "website": {
            "$ref": "#/components/schemas/StringUrl",
            "nullable": true
          }
        },
        "required": [
          "bio"
        ],
        "type": "object"
      },
      "ScalarBoolean": {
        "type": "boolean"
      },
      "ScalarString": {
        "type": "string"
      },
      "StringAllConstraints": {
        "format": "email",
        "maxLength": 50,
        "minLength": 6,
        "pattern": ".*@example\\.com$",
        "type": "string"
      },
      "StringColorHex": {
        "format": "color-hex",
        "type": "string"
      },
      "StringEmail": {
        "format": "email",
        "type": "string"
      },
      "StringEnum": {
        "enum": [
          "red",
          "green",
          "blue"
        ],
        "type": "string"
      },
      "StringMinMax": {
        "maxLength": 5,
        "minLength": 2,
        "type": "string"
      },
      "StringPattern": {
        "pattern": "^[a-z]+$",
        "type": "string"
      },
      "StringUri": {
        "format": "uri",
        "type": "string"
      },
      "StringUrl": {
        "format": "url",
        "type": "string"
      },
      "StringUuid": {
        "format": "uuid",
        "type": "string"
      },
      "Timestamped": {
        "properties": {
          "createdAt": {
            "format": "date-time",
            "type": "string"
          },
          "updatedAt": {
            "format": "date-time",
            "nullable": true,
            "type": "string"
          }
        },
        "required": [
          "createdAt"
        ],
        "type": "object"
      },
      "UnauthorizedError": {
        "additionalProperties": false,
        "properties": {
          "error": {
            "additionalProperties": false,
            "properties": {
              "code": {
                "enum": [
                  "UNAUTHORIZED"
                ],
                "type": "string"
              },
              "message": {
                "minLength": 1,
                "type": "string"
              }
            },
            "required": [
              "code",
              "message"
            ],
            "type": "object"
          }
        },
        "required": [
          "error"
        ],
        "type": "object"
      },
      "User": {
        "additionalProperties": false,
        "properties": {
          "email": {
            "$ref": "#/components/schemas/StringEmail"
          },
          "id": {
            "$ref": "#/components/schemas/StringUuid"
          },
          "name": {
            "minLength": 1,
            "type": "string"
          },
          "profile": {
            "$ref": "#/components/schemas/Profile",
            "nullable": true
          },
          "roles": {
            "items": {
              "$ref": "#/components/schemas/StringEnum"
            },
            "minItems": 1,
            "type": "array"
          }
        },
        "required": [
          "id",
          "name",
          "email",
          "roles"
        ],
        "type": "object"
      },
      "UserCreatedEvent": {
        "additionalProperties": false,
        "properties": {
          "data": {
            "$ref": "#/components/schemas/User"
          },
          "eventType": {
            "enum": [
              "user.created"
            ],
            "type": "string"
          }
        },
        "required": [
          "eventType",
          "data"
        ],
        "type": "object"
      },
      "ValidationError": {
        "additionalProperties": false,
        "properties": {
          "details": {
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "error": {
            "additionalProperties": false,
            "properties": {
              "code": {
                "enum": [
                  "VALIDATION_ERROR"
                ],
                "type": "string"
              },
              "message": {
                "minLength": 1,
                "type": "string"
              }
            },
            "required": [
              "code",
              "message"
            ],
            "type": "object"
          }
        },
        "required": [
          "error"
        ],
        "type": "object"
      }
    }
  },
  "info": {
    "title": "Alt Stack Master OpenAPI Test Spec",
    "version": "0.0.0"
  },
  "openapi": "3.0.0",
  "paths": {
    "/pets": {
      "get": {
        "responses": {
          "200": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Pet"
                }
              }
            },
            "description": "OK"
          },
          "401": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/UnauthorizedError"
                }
              }
            },
            "description": "Unauthorized"
          }
        }
      }
    },
    "/stats": {
      "get": {
        "responses": {
          "200": {
            "content": {
              "application/json": {
                "schema": {
                  "additionalProperties": false,
                  "properties": {
                    "count": {
                      "minimum": 0,
                      "type": "integer"
                    }
                  },
                  "required": [
                    "count"
                  ],
                  "type": "object"
                }
              }
            },
            "description": "OK"
          },
          "401": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/UnauthorizedError"
                }
              }
            },
            "description": "Unauthorized"
          }
        }
      }
    },
    "/users": {
      "post": {
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateUser"
              }
            }
          }
        },
        "responses": {
          "201": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/User"
                }
              }
            },
            "description": "Created"
          },
          "400": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ValidationError"
                }
              }
            },
            "description": "Validation error"
          },
          "401": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/UnauthorizedError"
                }
              }
            },
            "description": "Unauthorized"
          }
        }
      }
    },
    "/users/{id}": {
      "get": {
        "parameters": [
          {
            "in": "path",
            "name": "id",
            "required": true,
            "schema": {
              "format": "uuid",
              "type": "string"
            }
          },
          {
            "in": "query",
            "name": "includeProfile",
            "required": false,
            "schema": {
              "type": "boolean"
            }
          },
          {
            "in": "header",
            "name": "x-trace-id",
            "required": true,
            "schema": {
              "minLength": 8,
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/User"
                }
              }
            },
            "description": "OK"
          },
          "401": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/UnauthorizedError"
                }
              }
            },
            "description": "Unauthorized"
          },
          "404": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/NotFoundError"
                }
              }
            },
            "description": "Not found"
          }
        }
      }
    }
  }
}
`;

function loadMasterOpenApiSpec(): AnySchema {
  const specUrl = new URL("../../openapi-test-spec/openapi.json", import.meta.url);
  return JSON.parse(readFileSync(specUrl, "utf8")) as AnySchema;
}

function stripExamples(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map(stripExamples);
  }

  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(obj)) {
    if (key === "x-altstack-examples") continue;
    result[key] = stripExamples(child);
  }
  return result;
}

type GeneratedModule = Record<string, unknown> & {
  Request?: Record<string, unknown>;
  Response?: Record<string, unknown>;
};

async function loadGeneratedModule(tsCode: string): Promise<{
  module: GeneratedModule;
  tmpDir: string;
}> {
  const tmpDir = mkdtempSync(
    fileURLToPath(new URL("../.vitest-generated-", import.meta.url)),
  );

  const jsCode = ts.transpileModule(tsCode, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const entryPath = `${tmpDir}/generated.mjs`;
  writeFileSync(entryPath, jsCode, "utf8");

  // Cache-bust so local dev reruns always import the latest generated file
  const module = (await import(
    `${pathToFileURL(entryPath).href}?t=${Date.now()}`
  )) as GeneratedModule;

  return { module, tmpDir };
}

type OpenApiMeta = { format?: string; pattern?: string };

function getOpenApiMeta(schema: z.ZodTypeAny): OpenApiMeta | undefined {
  const meta = schema.meta();
  const openapi = (meta as { openapi?: unknown } | undefined)?.openapi;
  if (!openapi || typeof openapi !== "object") return undefined;

  const result: OpenApiMeta = {};
  const openapiObj = openapi as Record<string, unknown>;
  if (typeof openapiObj["format"] === "string") {
    result.format = openapiObj["format"];
  }
  if (typeof openapiObj["pattern"] === "string") {
    result.pattern = openapiObj["pattern"];
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function unwrapOptionalNullable(schema: z.ZodTypeAny): {
  schema: z.ZodTypeAny;
  optional: boolean;
  nullable: boolean;
  meta?: OpenApiMeta;
} {
  let current = schema;
  let optional = false;
  let nullable = false;
  let meta: OpenApiMeta | undefined = getOpenApiMeta(current);

  while (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
    if (!meta) meta = getOpenApiMeta(current);
    if (current instanceof z.ZodOptional) {
      optional = true;
      current = current._def.innerType as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodNullable) {
      nullable = true;
      current = current._def.innerType as z.ZodTypeAny;
    }
  }

  if (!meta) meta = getOpenApiMeta(current);

  return { schema: current, optional, nullable, meta };
}

function getCheckDef(check: unknown): unknown {
  if (!check || typeof check !== "object") return undefined;
  return (
    (check as any)._zod?.def ??
    (check as any).def
  );
}

function zodToOpenApiSchema(
  zodSchema: z.ZodTypeAny,
  ctx: {
    schemaToComponentName: Map<z.ZodTypeAny, string>;
    componentNameToSchema: Map<string, z.ZodTypeAny>;
  },
  options?: { selfComponentName?: string },
): AnySchema {
  const unwrapped = unwrapOptionalNullable(zodSchema);
  const schema = unwrapped.schema;

  const refName = ctx.schemaToComponentName.get(schema);
  if (refName && refName !== options?.selfComponentName) {
    const ref: AnySchema = { $ref: `#/components/schemas/${refName}` };
    if (unwrapped.nullable) ref.nullable = true;
    return ref;
  }

  let result: AnySchema;

  if (schema instanceof z.ZodEnum) {
    result = { type: "string", enum: schema.options };
  } else if (schema instanceof z.ZodString) {
    const meta = unwrapped.meta;
    const checks = (schema._def as any).checks as unknown[] | undefined;

    const openapi: AnySchema = { type: "string" };

    let minLength: number | undefined;
    let maxLength: number | undefined;
    let inferredFormat: string | undefined;
    const regexChecks: RegExp[] = [];

    for (const check of checks ?? []) {
      const def = getCheckDef(check) as any;
      if (!def || typeof def !== "object") continue;

      if (def.check === "min_length" && typeof def.minimum === "number") {
        minLength = def.minimum;
      } else if (def.check === "max_length" && typeof def.maximum === "number") {
        maxLength = def.maximum;
      } else if (def.check === "string_format") {
        if (typeof def.format === "string" && def.format !== "regex") {
          inferredFormat = def.format;
        }
        if (def.format === "regex" && def.pattern instanceof RegExp) {
          regexChecks.push(def.pattern);
        }
      }
    }

    if (typeof meta?.format === "string") {
      openapi.format = meta.format;
    } else if (typeof inferredFormat === "string") {
      openapi.format = inferredFormat;
    }

    if (typeof minLength === "number") openapi.minLength = minLength;
    if (typeof maxLength === "number") openapi.maxLength = maxLength;

    if (typeof meta?.pattern === "string") {
      openapi.pattern = meta.pattern;
    } else if (!openapi.format && regexChecks.length === 1) {
      openapi.pattern = regexChecks[0]!.source;
    }

    result = openapi;
  } else if (schema instanceof z.ZodNumber) {
    const checks = (schema._def as any).checks as unknown[] | undefined;
    let minimum: number | undefined;
    let maximum: number | undefined;
    let isInt = false;

    for (const check of checks ?? []) {
      const def = getCheckDef(check) as any;
      if (!def || typeof def !== "object") continue;

      if (def.check === "greater_than" && typeof def.value === "number") {
        if (def.inclusive === true) minimum = def.value;
      } else if (def.check === "less_than" && typeof def.value === "number") {
        if (def.inclusive === true) maximum = def.value;
      } else if (def.check === "number_format") {
        // `.int()` currently yields a "safeint" format in Zod v4
        if (def.format === "safeint" || def.format === "int") {
          isInt = true;
        }
      }
      if ((check as any).isInt === true) {
        isInt = true;
      }
    }

    result = { type: isInt ? "integer" : "number" };
    if (typeof minimum === "number") result.minimum = minimum;
    if (typeof maximum === "number") result.maximum = maximum;
  } else if (schema instanceof z.ZodBoolean) {
    result = { type: "boolean" };
  } else if (schema instanceof z.ZodArray) {
    const element = (schema._def as any).element as z.ZodTypeAny;
    const checks = (schema._def as any).checks as unknown[] | undefined;

    let minItems: number | undefined;
    let maxItems: number | undefined;

    for (const check of checks ?? []) {
      const def = getCheckDef(check) as any;
      if (!def || typeof def !== "object") continue;

      if (def.check === "min_length" && typeof def.minimum === "number") {
        minItems = def.minimum;
      } else if (def.check === "max_length" && typeof def.maximum === "number") {
        maxItems = def.maximum;
      }
    }

    result = {
      type: "array",
      items: zodToOpenApiSchema(element, ctx),
      ...(typeof minItems === "number" ? { minItems } : {}),
      ...(typeof maxItems === "number" ? { maxItems } : {}),
    };
  } else if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;

    const properties: Record<string, AnySchema> = {};
    const required: string[] = [];

    for (const [key, valueSchema] of Object.entries(shape)) {
      const u = unwrapOptionalNullable(valueSchema);
      if (!u.optional) required.push(key);
      properties[key] = zodToOpenApiSchema(
        u.schema,
        ctx,
        options,
      );
      if (u.nullable) {
        properties[key] = { ...properties[key], nullable: true };
      }
    }

    const isStrict =
      (schema as any)._def?.catchall instanceof z.ZodNever;

    result = {
      type: "object",
      ...(Object.keys(properties).length > 0 ? { properties } : {}),
      ...(required.length > 0 ? { required } : {}),
      ...(isStrict ? { additionalProperties: false } : {}),
    };
  } else if (schema instanceof z.ZodRecord) {
    const valueType = (schema._def as any).valueType as z.ZodTypeAny;
    if (valueType instanceof z.ZodUnknown) {
      result = { type: "object" };
    } else {
      result = {
        type: "object",
        additionalProperties: zodToOpenApiSchema(valueType, ctx),
      };
    }
  } else if (schema instanceof z.ZodUnion) {
    const unionOptions = (schema._def as any).options as z.ZodTypeAny[];
    const oneOf = unionOptions.map((opt) => zodToOpenApiSchema(opt, ctx, options));

    const discriminatorCandidates: string[] = [];
    for (const opt of unionOptions) {
      const optSchema = unwrapOptionalNullable(opt).schema;
      const optComponentName = ctx.schemaToComponentName.get(optSchema);
      const resolvedOptSchema = optComponentName
        ? ctx.componentNameToSchema.get(optComponentName)
        : optSchema;
      if (!(resolvedOptSchema instanceof z.ZodObject)) {
        discriminatorCandidates.length = 0;
        break;
      }

      const shape = resolvedOptSchema.shape as Record<string, z.ZodTypeAny>;
      const literals = Object.entries(shape)
        .map(([key, prop]) => ({ key, prop: unwrapOptionalNullable(prop) }))
        .filter(({ prop }) => !prop.optional)
        .filter(({ prop }) => prop.schema instanceof z.ZodEnum)
        .filter(({ prop }) => (prop.schema as z.ZodEnum<[string, ...string[]]>).options.length === 1)
        .map(({ key }) => key);

      if (discriminatorCandidates.length === 0) {
        discriminatorCandidates.push(...literals);
      } else {
        for (let i = discriminatorCandidates.length - 1; i >= 0; i--) {
          if (!literals.includes(discriminatorCandidates[i]!)) {
            discriminatorCandidates.splice(i, 1);
          }
        }
      }
    }

    const discriminatorKey =
      discriminatorCandidates.length === 1 ? discriminatorCandidates[0] : undefined;

    if (discriminatorKey) {
      const mapping: Record<string, string> = {};
      let allRefs = true;

      for (const opt of unionOptions) {
        const optSchema = unwrapOptionalNullable(opt).schema;
        const optName = ctx.schemaToComponentName.get(optSchema);
        if (!optName) {
          allRefs = false;
          break;
        }

        const resolvedOptSchema = ctx.componentNameToSchema.get(optName);
        if (!(resolvedOptSchema instanceof z.ZodObject)) {
          allRefs = false;
          break;
        }

        const shape = resolvedOptSchema.shape as Record<string, z.ZodTypeAny>;
        const prop = unwrapOptionalNullable(shape[discriminatorKey]!);
        if (!(prop.schema instanceof z.ZodEnum)) {
          allRefs = false;
          break;
        }
        const value = (prop.schema as z.ZodEnum<[string, ...string[]]>).options[0]!;
        mapping[value] = `#/components/schemas/${optName}`;
      }

      result = allRefs
        ? { oneOf, discriminator: { propertyName: discriminatorKey, mapping } }
        : { oneOf };
    } else {
      result = { oneOf };
    }
  } else if (schema instanceof z.ZodIntersection) {
    const parts: z.ZodTypeAny[] = [];
    const stack: z.ZodTypeAny[] = [schema];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current instanceof z.ZodIntersection) {
        stack.push((current._def as any).right as z.ZodTypeAny);
        stack.push((current._def as any).left as z.ZodTypeAny);
      } else {
        parts.push(current);
      }
    }

    result = {
      allOf: parts.map((p) => zodToOpenApiSchema(p, ctx, options)),
    };
  } else {
    throw new Error(`Unsupported Zod schema in roundtrip: ${schema._def?.type ?? schema.type}`);
  }

  if (unwrapped.nullable) {
    result = { ...result, nullable: true };
  }

  return result;
}

describe("master OpenAPI fixture", () => {
  let openapi: AnySchema;
  let openapiNoExamples: AnySchema;
  let tsCode: string;
  let generated: GeneratedModule;
  let tmpDir: string;

  beforeAll(async () => {
    openapi = loadMasterOpenApiSpec();
    openapiNoExamples = stripExamples(openapi) as AnySchema;

    tsCode = openApiToZodTsCode(openapi, undefined, { includeRoutes: true });
    const loaded = await loadGeneratedModule(tsCode);
    generated = loaded.module;
    tmpDir = loaded.tmpDir;
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("matches the full generated TypeScript output", () => {
    expect(normalizeSpacing(tsCode)).toBe(normalizeSpacing(EXPECTED_ZOD_TS));
  });

  it("matches the full regenerated OpenAPI JSON output (minus examples)", () => {
    const expected = normalizeSpacing(EXPECTED_OPENAPI_JSON);
    const actual = structuredClone(openapiNoExamples) as AnySchema;

    const schemaToComponentName = new Map<z.ZodTypeAny, string>();
    const componentNameToSchema = new Map<string, z.ZodTypeAny>();

    const componentSchemas = (actual.components?.schemas ?? {}) as Record<
      string,
      AnySchema
    >;
    for (const name of Object.keys(componentSchemas)) {
      const zodSchema = generated[`${name}Schema`] as z.ZodTypeAny | undefined;
      expect(zodSchema).toBeTruthy();
      componentNameToSchema.set(name, zodSchema!);
      schemaToComponentName.set(zodSchema!, name);
    }

    // Regenerate all component schemas
    for (const name of Object.keys(componentSchemas)) {
      (actual.components!.schemas as Record<string, AnySchema>)[name] =
        zodToOpenApiSchema(componentNameToSchema.get(name)!, {
          schemaToComponentName,
          componentNameToSchema,
        }, { selfComponentName: name });
    }

    // Regenerate all inline/path schemas (params/query/headers/body/responses)
    const requestByPath = (generated.Request ?? {}) as any;
    const responseByPath = (generated.Response ?? {}) as any;

    for (const [path, pathItem] of Object.entries(
      (actual.paths ?? {}) as Record<string, AnySchema>,
    )) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!operation || typeof operation !== "object") continue;
        if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) {
          continue;
        }

        const op = operation as AnySchema;
        const methodUpper = method.toUpperCase();
        const request = requestByPath?.[path]?.[methodUpper];
        const response = responseByPath?.[path]?.[methodUpper];

        if (Array.isArray(op["parameters"])) {
          for (const param of op["parameters"]) {
            if (!param || typeof param !== "object") continue;
            const paramObj = param as AnySchema;
            const location = paramObj["in"];
            const paramName = String(paramObj["name"] ?? "");

            const containerName =
              location === "path"
                ? "params"
                : location === "query"
                  ? "query"
                  : location === "header"
                    ? "headers"
                    : undefined;

            if (!containerName) continue;
            const container = request?.[containerName] as z.ZodTypeAny | undefined;
            if (!(container instanceof z.ZodObject)) continue;

            const shape = container.shape as Record<string, z.ZodTypeAny>;
            const prop = shape[paramName];
            if (!prop) continue;

            const u = unwrapOptionalNullable(prop);
            paramObj["schema"] = zodToOpenApiSchema(u.schema, {
              schemaToComponentName,
              componentNameToSchema,
            });
            if (u.nullable) {
              paramObj["schema"] = { ...paramObj["schema"], nullable: true };
            }
          }
        }

        if (op["requestBody"]) {
          const bodySchema = request?.["body"] as z.ZodTypeAny | undefined;
          const rb = op["requestBody"] as AnySchema;
          const json = rb?.["content"]?.["application/json"] as AnySchema | undefined;
          if (bodySchema && json && typeof json === "object") {
            json["schema"] = zodToOpenApiSchema(bodySchema, {
              schemaToComponentName,
              componentNameToSchema,
            });
          }
        }

        if (op["responses"] && typeof op["responses"] === "object") {
          for (const [statusCode, resp] of Object.entries(op["responses"])) {
            if (!resp || typeof resp !== "object") continue;
            const respObj = resp as AnySchema;
            const json = respObj?.["content"]?.["application/json"] as AnySchema | undefined;
            const respSchema = response?.[statusCode] as z.ZodTypeAny | undefined;
            if (respSchema && json && typeof json === "object") {
              json["schema"] = zodToOpenApiSchema(respSchema, {
                schemaToComponentName,
                componentNameToSchema,
              });
            }
          }
        }
      }
    }

    const actualJson = stableJsonStringify(actual);
    expect(normalizeSpacing(actualJson)).toBe(expected);
  });
});

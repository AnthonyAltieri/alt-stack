import type { Request } from "express";
import { ContextIdFactory } from "@nestjs/core";
import type { NestAppLike } from "./register.js";
import type { NestServiceLocator } from "./types.js";

const ALTSTACK_NEST_CONTEXT_ID_KEY = Symbol.for("@alt-stack/server-nestjs/context-id");
const ALTSTACK_NEST_LOCATOR_KEY = Symbol.for("@alt-stack/server-nestjs/nest-locator");
const ALTSTACK_NEST_REQUEST_REGISTERED_KEY = Symbol.for(
  "@alt-stack/server-nestjs/request-registered",
);

type RequestWithNestState = Request & Record<PropertyKey, unknown>;

function getRequestContextId(app: NestAppLike, req: RequestWithNestState): unknown {
  const existing = req[ALTSTACK_NEST_CONTEXT_ID_KEY];
  if (existing) {
    return existing;
  }

  const contextId = ContextIdFactory.getByRequest(req);

  if (
    typeof app.registerRequestByContextId === "function" &&
    req[ALTSTACK_NEST_REQUEST_REGISTERED_KEY] !== true
  ) {
    app.registerRequestByContextId(req, contextId);
    req[ALTSTACK_NEST_REQUEST_REGISTERED_KEY] = true;
  }

  req[ALTSTACK_NEST_CONTEXT_ID_KEY] = contextId;
  return contextId;
}

export function createNestLocator(
  app: NestAppLike,
  req?: Request,
): NestServiceLocator {
  const request = req as RequestWithNestState | undefined;
  const cached = request?.[ALTSTACK_NEST_LOCATOR_KEY];
  if (cached) {
    return cached as NestServiceLocator;
  }

  const get = <T,>(token: unknown): T => {
    try {
      return app.get<T>(token, { strict: false });
    } catch {
      return app.get<T>(token);
    }
  };

  const resolve = async <T,>(token: unknown): Promise<T> => {
    if (typeof app.resolve !== "function") {
      return get<T>(token);
    }

    const contextId = request ? getRequestContextId(app, request) : undefined;

    try {
      if (contextId !== undefined) {
        return await app.resolve<T>(token, contextId, { strict: false });
      }
      return await app.resolve<T>(token, undefined, { strict: false });
    } catch {
      if (contextId !== undefined) {
        return await app.resolve<T>(token, contextId);
      }
      return await app.resolve<T>(token);
    }
  };

  const locator: NestServiceLocator = { get, resolve };
  if (request) {
    request[ALTSTACK_NEST_LOCATOR_KEY] = locator;
  }
  return locator;
}

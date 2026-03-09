import type { Request } from "express";

export type AltStackRequestContext = Record<string, unknown>;

const ALTSTACK_REQUEST_CONTEXT_KEY = Symbol.for("@alt-stack/server-nestjs/request-context");

function getRequestStore(req: Request): Record<PropertyKey, unknown> {
  return req as unknown as Record<PropertyKey, unknown>;
}

export function readAltStackRequestContext(req: Request): AltStackRequestContext | undefined {
  const existing = getRequestStore(req)[ALTSTACK_REQUEST_CONTEXT_KEY];
  if (!existing || typeof existing !== "object") return undefined;
  return existing as AltStackRequestContext;
}

export function getAltStackRequestContext(req: Request): AltStackRequestContext {
  const existing = readAltStackRequestContext(req);
  if (existing) return existing;

  const bag: AltStackRequestContext = {};
  getRequestStore(req)[ALTSTACK_REQUEST_CONTEXT_KEY] = bag;
  return bag;
}

export function mergeAltStackRequestContext(req: Request, patch: AltStackRequestContext): void {
  Object.assign(getAltStackRequestContext(req), patch);
}

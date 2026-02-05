import type { Request } from "express";

export type AltStackRequestContext = Record<string, unknown>;

const ALTSTACK_REQUEST_CONTEXT_KEY = Symbol.for("@alt-stack/server-nestjs/request-context");

export function readAltStackRequestContext(req: Request): AltStackRequestContext | undefined {
  const existing = (req as any)[ALTSTACK_REQUEST_CONTEXT_KEY] as unknown;
  if (!existing || typeof existing !== "object") return undefined;
  return existing as AltStackRequestContext;
}

export function getAltStackRequestContext(req: Request): AltStackRequestContext {
  const existing = readAltStackRequestContext(req);
  if (existing) return existing;
  const bag: AltStackRequestContext = {};
  (req as any)[ALTSTACK_REQUEST_CONTEXT_KEY] = bag;
  return bag;
}

export function mergeAltStackRequestContext(req: Request, patch: AltStackRequestContext): void {
  Object.assign(getAltStackRequestContext(req), patch);
}


import type { Request, Response } from "express";
import type { z } from "zod";
import type { ZodError } from "zod";
import type { TelemetryOption } from "@alt-stack/server-core";
import type { Router } from "@alt-stack/server-core";
import { createDocsRouter, createServer } from "@alt-stack/server-express";
import type { CreateDocsRouterOptions } from "@alt-stack/server-express";
import type { NestBaseContext } from "./types.js";
import { createNestLocator } from "./nest-locator.js";
import { readAltStackRequestContext } from "./request-context.js";

export interface NestAppLike {
  getHttpAdapter: () => { getInstance: () => unknown };
  get: <T = unknown>(token: unknown, options?: unknown) => T;
  resolve?: <T = unknown>(token: unknown, contextId?: unknown, options?: unknown) => Promise<T>;
}

export interface DefaultErrorHandlers {
  default400Error: (
    errors: Array<[error: ZodError, variant: "body" | "param" | "query", value: unknown]>,
  ) => [z.ZodObject<any>, z.infer<z.ZodObject<any>>];
  default500Error: (error: unknown) => [z.ZodObject<any>, z.infer<z.ZodObject<any>>];
  default400ErrorSchema?: z.ZodObject<any>;
  default500ErrorSchema?: z.ZodObject<any>;
}

export type RegisterAltStackDocsOptions = CreateDocsRouterOptions & {
  /** Where to mount the docs router, relative to `mountPath` (default: `/docs`) */
  path?: string;
};

export interface RegisterAltStackOptions<TCustomContext extends object> {
  /** Base path to mount Alt Stack onto the Nest HTTP server (default: `/`) */
  mountPath?: string;
  /** Provide extra context fields (merged with `{ nest }`) */
  createContext?: (req: Request, res: Response) => Promise<TCustomContext> | TCustomContext;
  /** Override the default 400/500 error payloads */
  defaultErrorHandlers?: DefaultErrorHandlers;
  /** Enable OpenTelemetry tracing */
  telemetry?: TelemetryOption;
  /** Mount Swagger UI + OpenAPI JSON via the Express docs router */
  docs?: RegisterAltStackDocsOptions;
}

function normalizeMountPath(path: string | undefined): string {
  if (!path || path === "/") return "/";
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

function joinPaths(a: string, b: string): string {
  const left = normalizeMountPath(a);
  const right = b.startsWith("/") ? b : `/${b}`;
  if (left === "/") return right;
  if (right === "/") return left;
  return `${left}${right}`;
}

function getExpressInstance(app: NestAppLike): { use: (...args: any[]) => any } {
  const httpAdapter = app.getHttpAdapter?.();
  const instance = httpAdapter?.getInstance?.();
  if (!instance || typeof (instance as any).use !== "function") {
    throw new Error(
      "@alt-stack/server-nestjs requires NestJS on the Express platform (@nestjs/platform-express).",
    );
  }
  return instance as any;
}

export function registerAltStack<TCustomContext extends object = Record<string, never>>(
  app: NestAppLike,
  config: Record<
    string,
    Router<NestBaseContext & TCustomContext> | Router<NestBaseContext & TCustomContext>[]
  >,
  options?: RegisterAltStackOptions<TCustomContext>,
): void {
  const expressApp = getExpressInstance(app);
  const mountPath = normalizeMountPath(options?.mountPath);

  const altApp = createServer<NestBaseContext & TCustomContext>(config as any, {
    createContext: async (req, res) => {
      const nest = createNestLocator(app);
      const extra = options?.createContext ? await options.createContext(req, res) : ({} as TCustomContext);
      const fromMiddleware = readAltStackRequestContext(req) ?? ({} as TCustomContext);
      return {
        ...extra,
        ...fromMiddleware,
        nest,
      } as Omit<NestBaseContext & TCustomContext, "express" | "span">;
    },
    defaultErrorHandlers: options?.defaultErrorHandlers,
    telemetry: options?.telemetry,
  });

  expressApp.use(mountPath, altApp);

  if (options?.docs) {
    const docsPath = options.docs.path ?? "/docs";
    const { path: _path, ...docsOptions } = options.docs;
    const docsRouter = createDocsRouter(config as any, docsOptions);
    expressApp.use(joinPaths(mountPath, docsPath), docsRouter);
  }
}

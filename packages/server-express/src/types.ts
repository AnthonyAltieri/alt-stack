import type { Request, Response } from "express";
import type { BaseContext } from "@alt-stack/server-core";

/**
 * Express-specific base context that includes the Express req/res objects.
 * Extends the framework-agnostic BaseContext from server-core.
 */
export interface ExpressBaseContext extends BaseContext {
  express: {
    req: Request;
    res: Response;
  };
}


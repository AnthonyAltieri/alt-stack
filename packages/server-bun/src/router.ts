import type { BunServer } from "./types.js";

/**
 * Route definition for internal routing
 */
interface RouteDefinition {
  method: string;
  path: string;
  pattern: RegExp;
  paramNames: string[];
  handler: (
    req: Request,
    params: Record<string, string>,
    server: BunServer,
  ) => Promise<Response>;
}

/**
 * Simple router for Bun that handles path matching and parameter extraction.
 * Converts OpenAPI-style paths ({param}) to regex patterns for matching.
 */
export class BunRouter {
  private routes: RouteDefinition[] = [];

  /**
   * Register a route handler
   * @param method HTTP method (GET, POST, PUT, PATCH, DELETE)
   * @param path OpenAPI-style path (e.g., /users/{id})
   * @param handler Request handler function
   */
  register(
    method: string,
    path: string,
    handler: (
      req: Request,
      params: Record<string, string>,
      server: BunServer,
    ) => Promise<Response>,
  ): void {
    const { pattern, paramNames } = this.compilePath(path);
    this.routes.push({ method, path, pattern, paramNames, handler });
  }

  /**
   * Match a request to a registered route and execute its handler
   * @param req The incoming Request
   * @param server The Bun server instance
   * @returns Response if a route matches, null otherwise
   */
  async handle(req: Request, server: BunServer): Promise<Response | null> {
    const url = new URL(req.url);
    const method = req.method;
    const pathname = url.pathname;

    for (const route of this.routes) {
      if (route.method !== method) continue;

      const match = pathname.match(route.pattern);
      if (!match) continue;

      // Extract parameters from the match
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, index) => {
        params[name] = decodeURIComponent(match[index + 1] ?? "");
      });

      return route.handler(req, params, server);
    }

    return null; // No matching route
  }

  /**
   * Compile an OpenAPI-style path to a regex pattern
   * Examples:
   * - /users -> /^\/users$/
   * - /users/{id} -> /^\/users\/([^\/]+)$/
   * - /items/{category}/{id} -> /^\/items\/([^\/]+)\/([^\/]+)$/
   */
  private compilePath(path: string): {
    pattern: RegExp;
    paramNames: string[];
  } {
    const paramNames: string[] = [];

    // Escape special regex characters except { and }
    let regexStr = path.replace(/[.+?^$|()[\]\\]/g, "\\$&");

    // Replace {param} with capture groups
    regexStr = regexStr.replace(/\{([^}]+)\}/g, (_, paramName) => {
      paramNames.push(paramName);
      return "([^/]+)";
    });

    // Anchor the pattern
    const pattern = new RegExp(`^${regexStr}$`);

    return { pattern, paramNames };
  }
}

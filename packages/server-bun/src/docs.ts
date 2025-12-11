import { z } from "zod";
import {
  router,
  publicProcedure,
  generateOpenAPISpec,
  ok,
} from "@alt-stack/server-core";
import type { Router, GenerateOpenAPISpecOptions } from "@alt-stack/server-core";

export interface CreateDocsRouterOptions extends GenerateOpenAPISpecOptions {
  openapiPath?: string;
  enableDocs?: boolean;
}

const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.5/swagger-ui.css" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin:0;
      background: #fafafa;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '{{OPENAPI_URL}}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;

export function createDocsRouter<
  TCustomContext extends object = Record<string, never>,
>(
  config: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
  options: CreateDocsRouterOptions = {},
): Router<TCustomContext> {
  const spec = generateOpenAPISpec(config, options);
  // openapiPath should be relative (without leading slash) so it works correctly when mounted
  const openapiPathOption = options.openapiPath || "openapi.json";
  const openapiPath = openapiPathOption.startsWith("/")
    ? openapiPathOption.slice(1)
    : openapiPathOption;
  const enableDocs = options.enableDocs !== false; // Default to true

  // Use router() function to create a router with tRPC-style API
  const docsRouterConfig: Record<string, any> = {};

  // Serve OpenAPI spec as JSON
  const openapiSpecPath = `/${openapiPath}`;
  docsRouterConfig[openapiSpecPath] = publicProcedure
    .input({})
    .output(z.any())
    .get(() => {
      return ok(spec);
    });

  // Serve interactive documentation (Swagger UI)
  if (enableDocs) {
    docsRouterConfig["/"] = publicProcedure
      .input({})
      .get(async (opts) => {
        // Access Bun context via ctx.bun
        const bunCtx = (opts.ctx as any).bun;
        const requestUrl = new URL(bunCtx.req.url);
        const baseUrl = requestUrl.origin;
        // Get the pathname of the current request
        const currentPath = requestUrl.pathname;
        // Remove trailing slash if present
        const basePath =
          currentPath.endsWith("/") && currentPath !== "/"
            ? currentPath.slice(0, -1)
            : currentPath;
        // Construct openapi URL at the same mount level
        const openapiUrl = `${baseUrl}${basePath}/${openapiPath}`;
        const html = SWAGGER_UI_HTML.replace("{{OPENAPI_URL}}", openapiUrl);
        // Return HTML response with correct content type
        return ok(
          new Response(html, {
            headers: { "Content-Type": "text/html" },
          }),
        );
      });
  }

  return router<TCustomContext>(docsRouterConfig);
}

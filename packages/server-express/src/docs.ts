import express from "express";
import type { Router as ExpressRouter, Request, Response } from "express";
import { generateOpenAPISpec } from "@alt-stack/server-core";
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

/**
 * Creates an Express router that serves OpenAPI documentation.
 * Unlike the core Router, this returns a native Express router.
 */
export function createDocsRouter<
  TCustomContext extends object = Record<string, never>,
>(
  config: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
  options: CreateDocsRouterOptions = {},
): ExpressRouter {
  const spec = generateOpenAPISpec(config, options);
  const openapiPathOption = options.openapiPath || "openapi.json";
  const openapiPath = openapiPathOption.startsWith("/")
    ? openapiPathOption.slice(1)
    : openapiPathOption;
  const enableDocs = options.enableDocs !== false;

  const router = express.Router();

  // Serve OpenAPI spec as JSON
  router.get(`/${openapiPath}`, (_req: Request, res: Response) => {
    res.json(spec);
  });

  // Serve interactive documentation (Swagger UI)
  if (enableDocs) {
    router.get("/", (req: Request, res: Response) => {
      const protocol = req.protocol;
      const host = req.get("host");
      const baseUrl = `${protocol}://${host}`;
      const currentPath = req.baseUrl;
      const basePath =
        currentPath.endsWith("/") && currentPath !== "/"
          ? currentPath.slice(0, -1)
          : currentPath;
      const openapiUrl = `${baseUrl}${basePath}/${openapiPath}`;
      const html = SWAGGER_UI_HTML.replace("{{OPENAPI_URL}}", openapiUrl);
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    });
  }

  return router;
}


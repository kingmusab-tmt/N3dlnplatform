import { Router } from 'express';
import { fileURLToPath } from 'node:url';

export const OPENAPI_PATH = fileURLToPath(new URL('../../openapi.yaml', import.meta.url));

// Swagger UI from a pinned CDN build, so there's no frontend bundle to maintain.
const SWAGGER_UI_VERSION = '5.17.14';
const DOCS_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NIPOST 3D Navigation API</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css" />
  <style>body { margin: 0; background: #fff; } .topbar { display: none; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: 'openapi.yaml',
      dom_id: '#swagger-ui',
      deepLinking: true,
      tryItOutEnabled: true,
    });
  </script>
</body>
</html>`;

export function createDocsRouter() {
  const router = Router();

  // Raw spec: import into Postman, Insomnia or a client generator.
  router.get('/openapi.yaml', (_req, res) => {
    res.type('application/yaml').sendFile(OPENAPI_PATH);
  });

  router.get('/docs', (_req, res) => {
    res.type('html').send(DOCS_HTML);
  });

  return router;
}

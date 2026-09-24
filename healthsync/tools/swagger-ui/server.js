/**
 * HealthSync Swagger UI Server
 * Serves the OpenAPI 3.1 spec and Swagger UI at http://localhost:4010
 * Usage: node server.js
 *        PORT=4010 node server.js
 */
'use strict';

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT ?? '4010', 10);
// In Docker the spec is mounted at /docs/openapi.yaml via volume
// Locally it lives at ../../docs/openapi.yaml relative to this file
const SPEC_PATH = process.env.OPENAPI_SPEC_PATH
  || path.resolve(__dirname, '../../docs/openapi.yaml');

const app = express();

// Serve raw OpenAPI spec
app.get('/openapi.yaml', (_req, res) => {
  res.setHeader('Content-Type', 'application/x-yaml');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(SPEC_PATH);
});

app.get('/openapi.json', (_req, res) => {
  try {
    const spec = yaml.load(fs.readFileSync(SPEC_PATH, 'utf8'));
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(spec);
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse OpenAPI spec', detail: String(err) });
  }
});

// Swagger UI — load spec from YAML
let swaggerDocument;
try {
  swaggerDocument = yaml.load(fs.readFileSync(SPEC_PATH, 'utf8'));
} catch (err) {
  console.error('[swagger-ui] Failed to load OpenAPI spec:', err);
  process.exit(1);
}

const swaggerOptions = {
  swaggerOptions: {
    url: '/openapi.yaml',
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true,
  },
  customSiteTitle: 'HealthSync Indonesia — API Documentation',
  customCss: `
    .topbar { background-color: #1a56db; }
    .topbar-wrapper .link img { display: none; }
    .topbar-wrapper .link::after { content: 'HealthSync Indonesia'; color: white; font-size: 18px; font-weight: bold; }
  `,
};

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerOptions));

// Redirect root to docs
app.get('/', (_req, res) => res.redirect('/docs'));

// Health
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'swagger-ui', specPath: SPEC_PATH, timestamp: new Date().toISOString() })
);

app.listen(PORT, () => {
  console.log(`[swagger-ui] Listening on http://localhost:${PORT}`);
  console.log(`[swagger-ui] Swagger UI: http://localhost:${PORT}/docs`);
  console.log(`[swagger-ui] OpenAPI YAML: http://localhost:${PORT}/openapi.yaml`);
  console.log(`[swagger-ui] OpenAPI JSON: http://localhost:${PORT}/openapi.json`);
});

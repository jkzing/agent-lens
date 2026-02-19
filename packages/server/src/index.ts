import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import { createApp } from './app.js';
import { dbPath, hasUiDist, port, uiDistPath } from './config/runtime.js';

const { app, db } = createApp(dbPath);

if (hasUiDist) {
  app.use('/static/*', serveStatic({ root: uiDistPath }));
  app.use('/assets/*', serveStatic({ root: uiDistPath }));
  app.get('*', serveStatic({ path: path.join(uiDistPath, 'index.html') }));
}

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`[agent-lens/server] listening on http://localhost:${port}`);
  console.log(`[agent-lens/server] sqlite: ${dbPath}`);
  if (hasUiDist) {
    console.log(`[agent-lens/server] serving ui: ${uiDistPath}`);
  }
});

const shutdown = (signal: string) => {
  console.log(`[agent-lens/server] received ${signal}, shutting down...`);
  db.close();
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

import type { Hono } from 'hono';
import type { RouteDeps } from './types.js';
import { registerHealthRoutes } from './health.js';
import { registerOtlpRoutes } from './otlp.js';
import { registerSpansRoutes } from './spans.js';
import { registerSessionsRoutes } from './sessions.js';
import { registerTracesRoutes } from './traces.js';

export function registerRoutes(app: Hono, deps: RouteDeps) {
  registerHealthRoutes(app);
  registerOtlpRoutes(app, deps);
  registerSpansRoutes(app, deps);
  registerTracesRoutes(app, deps);
  registerSessionsRoutes(app, deps);
}

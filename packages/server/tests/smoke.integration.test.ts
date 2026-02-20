import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

function withRuntime(run: (runtime: ReturnType<typeof createApp>) => Promise<void>) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-lens-server-smoke-'));
    const dbFile = join(dir, 'smoke.db');
    const runtime = createApp(dbFile);

    try {
      await run(runtime);
    } finally {
      runtime.db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test(
  'smoke: GET /health returns service-ok baseline',
  withRuntime(async (runtime) => {
    const res = await runtime.app.request('http://localhost/health');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, service: 'agent-lens-server' });
  })
);

test(
  'smoke: GET /api/traces returns contract baseline shape',
  withRuntime(async (runtime) => {
    const res = await runtime.app.request('http://localhost/api/traces?limit=5&offset=0');
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.items));
    assert.equal(typeof body.pagination, 'object');
    assert.equal(body.pagination.limit, 5);
    assert.equal(body.pagination.offset, 0);
    assert.equal(typeof body.pagination.total, 'number');
  })
);

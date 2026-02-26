import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createApp } from '../src/app.js';

type Runtime = ReturnType<typeof createApp> & { cleanup: () => void };

type MeasureResult = {
  name: string;
  avgMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
};

function createRuntime(name: string): Runtime {
  const dir = mkdtempSync(join(tmpdir(), `agent-lens-bench-${name}-`));
  const dbFile = join(dir, 'bench.db');
  const runtime = createApp(dbFile);
  return {
    ...runtime,
    cleanup: () => {
      runtime.db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

function seed(runtime: Runtime, opts: { sessions: number; spansPerSession: number; orphanSpans: number }) {
  const insert = runtime.db.prepare(`
    INSERT INTO spans (
      received_at, trace_id, span_id, parent_span_id, name, kind,
      start_time_unix_nano, end_time_unix_nano, duration_ns,
      attributes, status_code, status, resource_attributes, events, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  runtime.db.exec('BEGIN');
  try {
    let global = 0;
    for (let s = 0; s < opts.sessions; s += 1) {
      const sessionKey = `sess-${String(s).padStart(5, '0')}`;
      const channel = s % 2 === 0 ? 'telegram' : 'discord';
      for (let i = 0; i < opts.spansPerSession; i += 1) {
        const start = 1_700_000_000_000_000_000n + BigInt(s) * 10_000_000_000n + BigInt(i) * 1_000_000n;
        const end = start + 800_000n;
        const id = global++;
        const eventName = i % 3 === 0 ? 'openclaw.message.processed' : i % 3 === 1 ? 'openclaw.agent.started' : 'openclaw.agent.finished';

        insert.run(
          `2026-02-26T00:${String((id / 60) % 60).padStart(2, '0')}:${String(id % 60).padStart(2, '0')}.000Z`,
          `trace-${sessionKey}-${i}`,
          `span-${sessionKey}-${i}`,
          null,
          eventName,
          1,
          start.toString(),
          end.toString(),
          Number(end - start),
          JSON.stringify({ 'openclaw.sessionKey': sessionKey, 'openclaw.channel': channel, state: i % 2 === 0 ? 'ok' : 'running' }),
          0,
          null,
          JSON.stringify({ 'service.name': s % 2 === 0 ? 'nyx' : 'runa' }),
          null,
          '{}'
        );
      }
    }

    for (let i = 0; i < opts.orphanSpans; i += 1) {
      const start = 1_700_100_000_000_000_000n + BigInt(i) * 1_000_000n;
      const end = start + 500_000n;
      insert.run(
        `2026-02-27T00:${String((i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`,
        `trace-orphan-${i}`,
        `span-orphan-${i}`,
        null,
        'openclaw.no-session',
        1,
        start.toString(),
        end.toString(),
        Number(end - start),
        JSON.stringify({}),
        0,
        null,
        JSON.stringify({ 'service.name': 'orphan' }),
        null,
        '{}'
      );
    }

    runtime.db.exec('COMMIT');
  } catch (error) {
    runtime.db.exec('ROLLBACK');
    throw error;
  }
}

function dropHardeningIndexes(runtime: Runtime) {
  runtime.db.exec(`
    DROP INDEX IF EXISTS idx_spans_session_key_start;
    DROP INDEX IF EXISTS idx_spans_channel_expr;
    DROP INDEX IF EXISTS idx_spans_name_start_time;
  `);
}

function ensureHardeningIndexes(runtime: Runtime) {
  runtime.db.exec(`
    CREATE INDEX IF NOT EXISTS idx_spans_session_key_start ON spans(
      COALESCE(
        json_extract(attributes, '$."openclaw.sessionKey"'),
        json_extract(attributes, '$."openclaw.sessionId"'),
        json_extract(resource_attributes, '$."openclaw.sessionKey"'),
        json_extract(resource_attributes, '$."openclaw.sessionId"')
      ),
      CAST(start_time_unix_nano AS INTEGER),
      id
    );
    CREATE INDEX IF NOT EXISTS idx_spans_channel_expr ON spans(
      COALESCE(
        json_extract(attributes, '$."openclaw.channel"'),
        json_extract(attributes, '$.channel'),
        json_extract(resource_attributes, '$."openclaw.channel"'),
        json_extract(resource_attributes, '$.channel')
      )
    );
    CREATE INDEX IF NOT EXISTS idx_spans_name_start_time ON spans(name, CAST(start_time_unix_nano AS INTEGER));
  `);
}

async function measureEndpoint(runtime: Runtime, name: string, path: string, opts = { warmup: 5, runs: 20 }): Promise<MeasureResult> {
  for (let i = 0; i < opts.warmup; i += 1) {
    const res = await runtime.app.request(`http://localhost${path}`);
    if (res.status !== 200) throw new Error(`${name} warmup failed: ${res.status}`);
    await res.arrayBuffer();
  }

  const timings: number[] = [];
  for (let i = 0; i < opts.runs; i += 1) {
    const t0 = performance.now();
    const res = await runtime.app.request(`http://localhost${path}`);
    if (res.status !== 200) throw new Error(`${name} run failed: ${res.status}`);
    await res.arrayBuffer();
    timings.push(performance.now() - t0);
  }

  const sorted = [...timings].sort((a, b) => a - b);
  const avgMs = timings.reduce((a, b) => a + b, 0) / timings.length;
  const p95Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];

  return {
    name,
    avgMs,
    p95Ms,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1]
  };
}

function format(result: MeasureResult) {
  return `${result.name.padEnd(46)} avg=${result.avgMs.toFixed(2)}ms p95=${result.p95Ms.toFixed(2)}ms min=${result.minMs.toFixed(2)}ms max=${result.maxMs.toFixed(2)}ms`;
}

async function runCase(mode: 'baseline' | 'improved') {
  const runtime = createRuntime(mode);
  try {
    seed(runtime, { sessions: 3000, spansPerSession: 25, orphanSpans: 5000 }); // 80,000 rows total

    if (mode === 'baseline') {
      dropHardeningIndexes(runtime);
    } else {
      ensureHardeningIndexes(runtime);
    }

    const cases: Array<{ name: string; path: string }> = [
      { name: 'overview:no-filter(limit=50)', path: '/api/sessions/overview?limit=50' },
      { name: 'overview:channel=telegram(limit=50)', path: '/api/sessions/overview?limit=50&channel=telegram' },
      { name: 'timeline:session(limit=100)', path: '/api/sessions/sess-00042/timeline?limit=100' },
      { name: 'timeline:session(limit=500)', path: '/api/sessions/sess-00042/timeline?limit=500' },
      {
        name: 'timeline:session+eventType(limit=500)',
        path: '/api/sessions/sess-00042/timeline?limit=500&eventType=openclaw.message.processed'
      }
    ];

    const results: MeasureResult[] = [];
    for (const item of cases) {
      results.push(await measureEndpoint(runtime, item.name, item.path));
    }

    return results;
  } finally {
    runtime.cleanup();
  }
}

(async () => {
  console.log('Session API benchmark (deterministic synthetic dataset)');
  console.log('Dataset: sessions=3000, spansPerSession=25, orphanSpans=5000 => total=80,000 rows');
  console.log('Warmup=5, runs=20, endpoint mode=local app.request()');

  const baseline = await runCase('baseline');
  const improved = await runCase('improved');

  console.log('\nBASELINE (without PR4 indexes)');
  baseline.forEach((row) => console.log(format(row)));

  console.log('\nIMPROVED (with PR4 indexes)');
  improved.forEach((row) => console.log(format(row)));

  console.log('\nDELTA (avg ms, negative is better)');
  for (const base of baseline) {
    const after = improved.find((it) => it.name === base.name);
    if (!after) continue;
    const delta = after.avgMs - base.avgMs;
    const pct = (delta / base.avgMs) * 100;
    console.log(`${base.name.padEnd(46)} delta=${delta.toFixed(2)}ms (${pct.toFixed(1)}%)`);
  }
})();

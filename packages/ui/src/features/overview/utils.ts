import { detectSpanType, parseJsonObject, toNumber } from '@/hooks/useDebugViewState';
import type { SpanRow } from '@/hooks/useTraceData';
import type { OverviewDataMode, OverviewStep } from './OverviewPanel';

type PricingRule = {
  key: string;
  matchers: string[];
  inputPerToken: number;
  outputPerToken: number;
};

const PRICING_RULES: PricingRule[] = [
  { key: 'openai:gpt-4o', matchers: ['openai/gpt-4o', 'gpt-4o'], inputPerToken: 0.0000025, outputPerToken: 0.00001 },
  { key: 'openai:gpt-4.1', matchers: ['openai/gpt-4.1', 'gpt-4.1'], inputPerToken: 0.000002, outputPerToken: 0.000008 },
  { key: 'openai:gpt-5', matchers: ['openai-codex/gpt-5', 'openai/gpt-5', 'gpt-5'], inputPerToken: 0.000003, outputPerToken: 0.000015 },
  { key: 'anthropic:claude-3-7', matchers: ['anthropic/claude-3-7', 'claude-3-7'], inputPerToken: 0.000003, outputPerToken: 0.000015 },
  { key: 'anthropic:claude-sonnet-4', matchers: ['anthropic/claude-sonnet-4', 'claude-sonnet-4', 'sonnet'], inputPerToken: 0.000003, outputPerToken: 0.000015 },
  { key: 'anthropic:claude-opus-4', matchers: ['anthropic/claude-opus-4', 'claude-opus-4', 'opus'], inputPerToken: 0.000015, outputPerToken: 0.000075 },
  { key: 'google:gemini-2.5', matchers: ['google/gemini-2.5', 'gemini-2.5'], inputPerToken: 0.0000025, outputPerToken: 0.00001 },
  { key: 'deepseek:deepseek-v3', matchers: ['deepseek/deepseek-v3', 'deepseek-v3'], inputPerToken: 0.000001, outputPerToken: 0.000002 },
  { key: 'default', matchers: [], inputPerToken: 0.000003, outputPerToken: 0.000015 }
];

export function formatDurationNs(durationNs: number | null): string {
  if (durationNs == null) return '-';
  if (durationNs < 1_000) return `${durationNs} ns`;
  if (durationNs < 1_000_000) return `${(durationNs / 1_000).toFixed(2)} μs`;
  if (durationNs < 1_000_000_000) return `${(durationNs / 1_000_000).toFixed(2)} ms`;
  return `${(durationNs / 1_000_000_000).toFixed(2)} s`;
}

export function detectActor(name: string): 'Human' | 'Lumi' | 'Nyx' | 'Runa' | 'System' {
  const n = (name || '').toLowerCase();
  if (n.includes('human') || n.includes('user') || n.includes('kai')) return 'Human';
  if (n.includes('lumi')) return 'Lumi';
  if (n.includes('nyx')) return 'Nyx';
  if (n.includes('runa')) return 'Runa';
  return 'System';
}

function normalizeValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

export function getSpanModelInfo(span: SpanRow): { provider: string; model: string } {
  const attrs = parseJsonObject(span.attributes);
  const resource = parseJsonObject(span.resource_attributes);
  const model =
    attrs['gen_ai.request.model'] ??
    attrs['llm.model'] ??
    attrs['model'] ??
    attrs['ai.model'] ??
    resource['gen_ai.request.model'] ??
    resource['llm.model'] ??
    resource['model'] ??
    'unknown';
  const provider =
    attrs['gen_ai.system'] ??
    attrs['gen_ai.provider'] ??
    attrs['provider'] ??
    resource['service.namespace'] ??
    resource['provider'] ??
    'unknown';

  return {
    model: typeof model === 'string' && model.trim() ? model.trim() : 'unknown',
    provider: typeof provider === 'string' && provider.trim() ? provider.trim() : 'unknown'
  };
}

function findPricingRule(provider: string, model: string): PricingRule {
  const full = normalizeValue(`${provider}/${model}`);
  const modelOnly = normalizeValue(model);
  for (const rule of PRICING_RULES) {
    if (rule.key === 'default') continue;
    if (rule.matchers.some((m) => full.includes(m) || modelOnly.includes(m))) return rule;
  }
  return PRICING_RULES.find((rule) => rule.key === 'default')!;
}

export function estimateCost(inputTokens: number, outputTokens: number, provider: string, model: string): number {
  const rule = findPricingRule(provider, model);
  return inputTokens * rule.inputPerToken + outputTokens * rule.outputPerToken;
}

function summarize(attrs: Record<string, any>, keys: string[], fallback = '(none)') {
  for (const key of keys) {
    const value = attrs[key];
    if (value == null) continue;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text && text.trim()) return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  }
  return fallback;
}

export function buildOverviewSteps(spans: SpanRow[]): OverviewStep[] {
  const spanById = new Map<string, SpanRow>();
  for (const span of spans) {
    if (span.span_id) spanById.set(span.span_id, span);
  }

  return spans
    .map((span, index) => {
      const attrs = parseJsonObject(span.attributes);
      const parent = span.parent_span_id ? spanById.get(span.parent_span_id) : null;
      const spanType = detectSpanType(span, attrs);
      const status: 'success' | 'running' | 'error' | 'waiting' =
        span.status_code === 2 ? 'error' : span.end_time_unix_nano ? 'success' : span.parent_span_id ? 'waiting' : 'running';
      const fromActor = parent?.name || 'system';
      const toActor = span.name || 'unknown';
      const fromLane = detectActor(fromActor);
      const toLane = detectActor(toActor);
      const inputSummary = summarize(attrs, ['tool.input', 'tool.arguments', 'input', 'gen_ai.content.prompt', 'prompt']);
      const outputSummary = summarize(attrs, ['tool.output', 'output', 'gen_ai.content.completion', 'completion']);
      const inputTokens = toNumber(attrs['gen_ai.usage.input_tokens']);
      const outputTokens = toNumber(attrs['gen_ai.usage.output_tokens']);
      const modelInfo = getSpanModelInfo(span);
      const cost = estimateCost(inputTokens, outputTokens, modelInfo.provider, modelInfo.model);
      const actionType = spanType === 'tool' ? 'Tool Call' : spanType === 'llm' ? 'LLM Call' : 'Internal';

      return {
        id: span.id,
        index: index + 1,
        fromActor,
        toActor,
        fromLane,
        toLane,
        actionType,
        status,
        duration: formatDurationNs(span.duration_ns),
        durationNs: span.duration_ns ?? 0,
        inputSummary,
        outputSummary,
        inputTokens,
        outputTokens,
        cost,
        attrs,
        modelInfo,
        errorMessage: span.status_code === 2 ? attrs['error.message'] || attrs['exception.message'] || 'Span failed' : null,
        startedAt: span.start_time_unix_nano ? Number(span.start_time_unix_nano) : 0,
        timestamp: span.received_at
      };
    })
    .sort((a, b) => a.startedAt - b.startedAt || a.id - b.id);
}

function createMockScenario(
  baseIso: string,
  rows: Array<{
    from: string;
    to: string;
    type: string;
    status: 'success' | 'running' | 'error' | 'waiting';
    durationMs: number;
    offsetMs: number;
    input: string;
    output: string;
    error?: string;
    attrs?: Record<string, any>;
    tokens?: { in: number; out: number; provider?: string; model?: string };
  }>
): OverviewStep[] {
  return rows.map((row, idx) => {
    const ts = new Date(new Date(baseIso).getTime() + row.offsetMs).toISOString();
    const inTokens = row.tokens?.in ?? 0;
    const outTokens = row.tokens?.out ?? 0;
    const provider = row.tokens?.provider ?? 'unknown';
    const model = row.tokens?.model ?? 'unknown';
    return {
      id: 10_000 + idx,
      index: idx + 1,
      fromActor: row.from,
      toActor: row.to,
      fromLane: detectActor(row.from),
      toLane: detectActor(row.to),
      actionType: row.type,
      status: row.status,
      duration: `${row.durationMs} ms`,
      durationNs: row.durationMs * 1_000_000,
      inputSummary: row.input,
      outputSummary: row.output,
      inputTokens: inTokens,
      outputTokens: outTokens,
      cost: estimateCost(inTokens, outTokens, provider, model),
      attrs: {
        ...row.attrs,
        'mock.input': row.input,
        'mock.output': row.output,
        ...(row.error ? { 'error.message': row.error } : {})
      },
      modelInfo: { provider, model },
      errorMessage: row.error ?? null,
      startedAt: new Date(ts).getTime() * 1_000_000,
      timestamp: ts
    };
  });
}

export function buildOverviewMockScenarios(baseIso = new Date().toISOString()): Record<Exclude<OverviewDataMode, 'live'>, OverviewStep[]> {
  return {
    'demo-happy': createMockScenario(baseIso, [
      { from: 'Human', to: 'Lumi', type: 'send', status: 'success', durationMs: 120, offsetMs: 0, input: 'Ask for yesterday KPI summary', output: 'Intent parsed + requirements captured' },
      { from: 'Lumi', to: 'Nyx', type: 'run', status: 'success', durationMs: 380, offsetMs: 400, input: 'Delegate data fetch & compose report', output: 'Task accepted with context', attrs: { handoff: true } },
      { from: 'Nyx', to: 'System', type: 'tool', status: 'success', durationMs: 920, offsetMs: 1100, input: 'Query analytics DB for KPI window', output: 'Received KPI rows and deltas' },
      { from: 'Nyx', to: 'Lumi', type: 'reply', status: 'success', durationMs: 260, offsetMs: 2200, input: 'Provide formatted KPI bullets', output: 'Delivered concise report draft' },
      { from: 'Lumi', to: 'Human', type: 'reply', status: 'success', durationMs: 140, offsetMs: 2600, input: 'Render final summary', output: 'Summary sent to user', tokens: { in: 320, out: 180, provider: 'openai', model: 'gpt-4.1' } }
    ]),
    'demo-handoff': createMockScenario(baseIso, [
      { from: 'Human', to: 'Lumi', type: 'send', status: 'success', durationMs: 150, offsetMs: 0, input: 'Implement UI polish + bugfix', output: 'Task scoped into subtasks' },
      { from: 'Lumi', to: 'Nyx', type: 'run', status: 'success', durationMs: 290, offsetMs: 500, input: 'Hotfix timeline alignment', output: 'Nyx starts coding', attrs: { handoff: 'Lumi->Nyx' } },
      { from: 'Nyx', to: 'Runa', type: 'run', status: 'waiting', durationMs: 80, offsetMs: 950, input: 'Ask Runa to verify visual regressions', output: 'Awaiting verification response', attrs: { handoff: 'Nyx->Runa' } },
      { from: 'Runa', to: 'System', type: 'tool', status: 'running', durationMs: 1800, offsetMs: 1300, input: 'Run screenshot comparison job', output: 'Comparing baseline vs current build' },
      { from: 'Runa', to: 'Nyx', type: 'reply', status: 'success', durationMs: 260, offsetMs: 3400, input: 'Send validation findings', output: 'No blocker; minor spacing note' },
      { from: 'Nyx', to: 'Lumi', type: 'reply', status: 'success', durationMs: 180, offsetMs: 3900, input: 'Return merged patch + notes', output: 'Patch ready to ship' }
    ]),
    'demo-recovery': createMockScenario(baseIso, [
      { from: 'Human', to: 'Lumi', type: 'send', status: 'success', durationMs: 110, offsetMs: 0, input: 'Generate release note digest', output: 'Plan drafted' },
      { from: 'Lumi', to: 'Nyx', type: 'run', status: 'success', durationMs: 240, offsetMs: 320, input: 'Collect PR metadata and summarize', output: 'Execution started' },
      { from: 'Nyx', to: 'System', type: 'tool', status: 'error', durationMs: 740, offsetMs: 820, input: 'Fetch PR data from API', output: 'HTTP 502 from upstream', error: 'Gateway timeout while calling GitHub API' },
      { from: 'Nyx', to: 'System', type: 'tool', status: 'success', durationMs: 910, offsetMs: 1900, input: 'Retry fetch with fallback mirror', output: 'Recovered data from mirror endpoint', attrs: { retry: 1 } },
      { from: 'Nyx', to: 'Lumi', type: 'reply', status: 'success', durationMs: 220, offsetMs: 3000, input: 'Send recovered summary draft', output: 'Summary accepted after retry' },
      { from: 'Lumi', to: 'Human', type: 'reply', status: 'success', durationMs: 130, offsetMs: 3380, input: 'Deliver final digest', output: 'User received release digest', tokens: { in: 280, out: 160, provider: 'anthropic', model: 'claude-sonnet-4' } }
    ])
  };
}

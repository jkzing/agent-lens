import { useMemo } from 'react';
import type { SpanRow } from '@/hooks/useTraceData';
import type { OverviewActor, OverviewDataMode, OverviewStep, OverviewTimeFilter } from './OverviewPanel';
import { buildOverviewMockScenarios, buildOverviewSteps, formatDurationNs } from './utils';

type DeriveOverviewDataInput = {
  spans: SpanRow[];
  overviewActorFilter: OverviewActor;
  overviewTimeFilter: OverviewTimeFilter;
  overviewDataMode: OverviewDataMode;
  nowMs?: number;
};

export function deriveOverviewData({
  spans,
  overviewActorFilter,
  overviewTimeFilter,
  overviewDataMode,
  nowMs = Date.now()
}: DeriveOverviewDataInput) {
  const overviewSteps = buildOverviewSteps(spans);
  const overviewMockScenarios = buildOverviewMockScenarios();
  const effectiveOverviewMode = overviewDataMode === 'live' && overviewSteps.length === 0 ? 'demo-recovery' : overviewDataMode;
  const activeOverviewSteps = effectiveOverviewMode === 'live' ? overviewSteps : overviewMockScenarios[effectiveOverviewMode];

  const filteredOverviewSteps = activeOverviewSteps.filter((step) => {
    if (overviewActorFilter !== 'all' && step.fromLane !== overviewActorFilter && step.toLane !== overviewActorFilter) return false;
    if (overviewTimeFilter === 'all') return true;
    const ageMs = nowMs - new Date(step.timestamp).getTime();
    if (overviewTimeFilter === '5m') return ageMs <= 5 * 60 * 1000;
    if (overviewTimeFilter === '1h') return ageMs <= 60 * 60 * 1000;
    if (overviewTimeFilter === '24h') return ageMs <= 24 * 60 * 60 * 1000;
    return true;
  });

  const total = filteredOverviewSteps.length;
  const success = filteredOverviewSteps.filter((s) => s.status === 'success').length;
  const blocked = filteredOverviewSteps.filter((s) => s.status === 'waiting' || s.status === 'running').length;
  const avgDurationNs = total > 0 ? filteredOverviewSteps.reduce((sum, step) => sum + step.durationNs, 0) / total : 0;

  return {
    effectiveOverviewMode,
    filteredOverviewSteps,
    overviewKpis: {
      total,
      successRate: total > 0 ? (success / total) * 100 : 0,
      avgDuration: formatDurationNs(avgDurationNs || 0),
      blocked
    }
  };
}

export function useOverviewData({ spans, overviewActorFilter, overviewTimeFilter, overviewDataMode }: DeriveOverviewDataInput) {
  return useMemo(
    () =>
      deriveOverviewData({
        spans,
        overviewActorFilter,
        overviewTimeFilter,
        overviewDataMode
      }),
    [spans, overviewActorFilter, overviewTimeFilter, overviewDataMode]
  );
}

export function pickSelectedOverviewStep(filteredOverviewSteps: OverviewStep[], selectedOverviewStepId: number | null): OverviewStep | null {
  return filteredOverviewSteps.find((step) => step.id === selectedOverviewStepId) || filteredOverviewSteps[0] || null;
}

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from '@rstest/core';
import { OverviewPanel, type OverviewStep } from './OverviewPanel';

function makeStep(id: number, fromLane: 'Human' | 'Lumi' | 'Nyx' | 'Runa' | 'System', toLane: 'Human' | 'Lumi' | 'Nyx' | 'Runa' | 'System'): OverviewStep {
  return {
    id,
    index: id,
    fromActor: fromLane,
    toActor: toLane,
    fromLane,
    toLane,
    actionType: 'Tool Call',
    status: 'success',
    duration: '120 ms',
    durationNs: 120_000_000,
    inputSummary: `input-${id}`,
    outputSummary: `output-${id}`,
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    attrs: { id },
    modelInfo: { provider: 'unknown', model: 'unknown' },
    errorMessage: null,
    startedAt: Date.now() * 1_000_000,
    timestamp: new Date().toISOString(),
  };
}

describe('OverviewPanel', () => {
  afterEach(() => cleanup());
  it('renders overview panel smoke', () => {
    const steps = [makeStep(1, 'Human', 'Lumi')];

    render(
      <OverviewPanel
        overviewTimeFilter="all"
        setOverviewTimeFilter={() => {}}
        overviewActorFilter="all"
        setOverviewActorFilter={() => {}}
        overviewDataMode="live"
        setOverviewDataMode={() => {}}
        effectiveOverviewMode="live"
        overviewKpis={{ total: 1, successRate: 100, avgDuration: '120 ms', blocked: 0 }}
        filteredOverviewSteps={steps}
        selectedOverviewStep={steps[0]}
        selectedOverviewStepId={steps[0].id}
        setSelectedOverviewStepId={() => {}}
        overviewShowRaw={false}
        setOverviewShowRaw={() => {}}
        overviewHoverStepId={null}
        setOverviewHoverStepId={() => {}}
      />
    );

    expect(screen.getByTestId('overview-panel')).toBeTruthy();
    expect(screen.getByText('Interaction Timeline')).toBeTruthy();
    expect(screen.getByText('Step Detail')).toBeTruthy();
  });

  it('invokes filter callbacks', () => {
    const timeFilterCalls: string[] = [];
    const actorFilterCalls: string[] = [];
    const modeCalls: string[] = [];

    render(
      <OverviewPanel
        overviewTimeFilter="all"
        setOverviewTimeFilter={(v) => timeFilterCalls.push(v)}
        overviewActorFilter="all"
        setOverviewActorFilter={(v) => actorFilterCalls.push(v)}
        overviewDataMode="live"
        setOverviewDataMode={(v) => modeCalls.push(v)}
        effectiveOverviewMode="live"
        overviewKpis={{ total: 0, successRate: 0, avgDuration: '0 ms', blocked: 0 }}
        filteredOverviewSteps={[]}
        selectedOverviewStep={null}
        selectedOverviewStepId={null}
        setSelectedOverviewStepId={() => {}}
        overviewShowRaw={false}
        setOverviewShowRaw={() => {}}
        overviewHoverStepId={null}
        setOverviewHoverStepId={() => {}}
      />
    );

    fireEvent.change(screen.getByDisplayValue('All time'), { target: { value: '1h' } });
    fireEvent.change(screen.getByDisplayValue('All actors'), { target: { value: 'Nyx' } });
    fireEvent.change(screen.getByDisplayValue('Live data'), { target: { value: 'demo-handoff' } });

    expect(timeFilterCalls).toEqual(['1h']);
    expect(actorFilterCalls).toEqual(['Nyx']);
    expect(modeCalls).toEqual(['demo-handoff']);
  });

  it('invokes selection callback when clicking a rendered step', () => {
    const selected: number[] = [];
    const steps = [makeStep(1, 'Human', 'Lumi'), makeStep(2, 'Lumi', 'Nyx')];

    render(
      <OverviewPanel
        overviewTimeFilter="all"
        setOverviewTimeFilter={() => {}}
        overviewActorFilter="all"
        setOverviewActorFilter={() => {}}
        overviewDataMode="live"
        setOverviewDataMode={() => {}}
        effectiveOverviewMode="live"
        overviewKpis={{ total: 2, successRate: 100, avgDuration: '120 ms', blocked: 0 }}
        filteredOverviewSteps={steps}
        selectedOverviewStep={steps[0]}
        selectedOverviewStepId={steps[0].id}
        setSelectedOverviewStepId={(id) => selected.push(id)}
        overviewShowRaw={false}
        setOverviewShowRaw={() => {}}
        overviewHoverStepId={null}
        setOverviewHoverStepId={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Lumi → Nyx/i }));
    expect(selected).toEqual([2]);
  });
});

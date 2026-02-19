import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Bot, Reply, Send, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

type OverviewStatus = 'success' | 'running' | 'error' | 'waiting';
export type OverviewActor = 'all' | 'Human' | 'Lumi' | 'Nyx' | 'Runa' | 'System';
export type OverviewTimeFilter = 'all' | '5m' | '1h' | '24h';
export type OverviewDataMode = 'live' | 'demo-happy' | 'demo-handoff' | 'demo-recovery';

export type OverviewStep = {
  id: number;
  index: number;
  fromActor: string;
  toActor: string;
  fromLane: 'Human' | 'Lumi' | 'Nyx' | 'Runa' | 'System';
  toLane: 'Human' | 'Lumi' | 'Nyx' | 'Runa' | 'System';
  actionType: string;
  status: OverviewStatus;
  duration: string;
  durationNs: number;
  inputSummary: string;
  outputSummary: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  attrs: Record<string, any>;
  modelInfo: { provider: string; model: string };
  errorMessage: string | null;
  startedAt: number;
  timestamp: string;
};

type OverviewKpis = {
  total: number;
  successRate: number;
  avgDuration: string;
  blocked: number;
};

type OverviewPanelProps = {
  overviewTimeFilter: OverviewTimeFilter;
  setOverviewTimeFilter: (value: OverviewTimeFilter) => void;
  overviewActorFilter: OverviewActor;
  setOverviewActorFilter: (value: OverviewActor) => void;
  overviewDataMode: OverviewDataMode;
  setOverviewDataMode: (value: OverviewDataMode) => void;
  effectiveOverviewMode: OverviewDataMode;
  overviewKpis: OverviewKpis;
  filteredOverviewSteps: OverviewStep[];
  selectedOverviewStep: OverviewStep | null;
  selectedOverviewStepId: number | null;
  setSelectedOverviewStepId: (id: number) => void;
  overviewShowRaw: boolean;
  setOverviewShowRaw: (value: boolean) => void;
  overviewHoverStepId: number | null;
  setOverviewHoverStepId: (id: number | null) => void;
};

function statusBadgeVariant(status: OverviewStatus): 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'success') return 'success';
  if (status === 'running') return 'warning';
  if (status === 'error') return 'destructive';
  return 'outline';
}

function stepIcon(type: string, status: string) {
  if (status === 'error') return AlertTriangle;
  if (type.toLowerCase().includes('tool')) return Wrench;
  if (type.toLowerCase().includes('llm')) return Bot;
  if (type.toLowerCase().includes('reply')) return Reply;
  return Send;
}

const laneOrder = ['Human', 'Lumi', 'Nyx', 'Runa', 'System'] as const;
const laneIndex = (lane: string) => {
  const idx = laneOrder.indexOf(lane as (typeof laneOrder)[number]);
  return idx >= 0 ? idx : laneOrder.length - 1;
};

export function OverviewPanel({
  overviewTimeFilter,
  setOverviewTimeFilter,
  overviewActorFilter,
  setOverviewActorFilter,
  overviewDataMode,
  setOverviewDataMode,
  effectiveOverviewMode,
  overviewKpis,
  filteredOverviewSteps,
  selectedOverviewStep,
  selectedOverviewStepId,
  setSelectedOverviewStepId,
  overviewShowRaw,
  setOverviewShowRaw,
  overviewHoverStepId,
  setOverviewHoverStepId,
}: OverviewPanelProps) {
  return (
    <div className="space-y-4" data-testid="overview-panel">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={overviewTimeFilter}
              onChange={(e) => setOverviewTimeFilter(e.target.value as OverviewTimeFilter)}
            >
              <option value="all">All time</option>
              <option value="5m">Last 5m</option>
              <option value="1h">Last 1h</option>
              <option value="24h">Last 24h</option>
            </select>
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={overviewActorFilter}
              onChange={(e) => setOverviewActorFilter(e.target.value as OverviewActor)}
            >
              <option value="all">All actors</option>
              <option value="Human">Human</option>
              <option value="Lumi">Lumi</option>
              <option value="Nyx">Nyx</option>
              <option value="Runa">Runa</option>
              <option value="System">System</option>
            </select>
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={overviewDataMode}
              onChange={(e) => setOverviewDataMode(e.target.value as OverviewDataMode)}
            >
              <option value="live">Live data</option>
              <option value="demo-happy">Demo: happy path</option>
              <option value="demo-handoff">Demo: multi-agent handoff</option>
              <option value="demo-recovery">Demo: error + retry recovery</option>
            </select>
          </div>
          {overviewDataMode === 'live' && effectiveOverviewMode !== 'live' ? (
            <div className="mt-2 text-xs text-muted-foreground">
              Live trace data is empty, auto-fallback to demo scenario: error + retry recovery.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total interactions</div><div className="text-2xl font-semibold">{overviewKpis.total}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Success rate</div><div className="text-2xl font-semibold">{overviewKpis.successRate.toFixed(0)}%</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Avg duration</div><div className="text-2xl font-semibold">{overviewKpis.avgDuration}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Blocked now</div><div className="text-2xl font-semibold">{overviewKpis.blocked}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Interaction Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-360px)] rounded border border-border bg-background/30 [&_[data-radix-scroll-area-viewport]]:overflow-x-auto [&_[data-radix-scroll-area-viewport]]:overflow-y-auto">
              <div className="min-w-[900px] p-3">
                <div className="grid grid-cols-5 gap-2">
                  {laneOrder.map((lane) => (
                    <div key={lane} className="rounded-md border border-border bg-background/60 px-2 py-1 text-center text-xs font-semibold text-muted-foreground">{lane}</div>
                  ))}
                </div>

                {filteredOverviewSteps.length === 0 ? (
                  <div className="mt-4 rounded border border-border bg-background/40 p-3 text-sm text-muted-foreground">No interaction steps under current filters.</div>
                ) : (
                  <div className="relative mt-3" style={{ height: `${filteredOverviewSteps.length * 86 + 24}px` }}>
                    <svg className="pointer-events-none absolute inset-0" width="100%" height="100%">
                      <defs>
                        <marker id="arrow-head" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                          <path d="M0,0 L0,6 L6,3 z" fill="currentColor" />
                        </marker>
                      </defs>
                      {filteredOverviewSteps.map((step, idx) => {
                        if (idx === 0) return null;
                        const prev = filteredOverviewSteps[idx - 1];
                        const x1 = ((laneIndex(prev.toLane) + 0.5) / laneOrder.length) * 100;
                        const x2 = ((laneIndex(step.toLane) + 0.5) / laneOrder.length) * 100;
                        const y1 = idx * 86 - 30;
                        const y2 = idx * 86 + 8;
                        const highlighted = overviewHoverStepId === step.id || overviewHoverStepId === prev.id;
                        return (
                          <line
                            key={`link-${prev.id}-${step.id}`}
                            x1={`${x1}%`}
                            y1={y1}
                            x2={`${x2}%`}
                            y2={y2}
                            stroke={highlighted ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                            strokeWidth={highlighted ? 2 : 1}
                            markerEnd="url(#arrow-head)"
                            className="transition-all duration-150"
                          />
                        );
                      })}
                    </svg>

                    {filteredOverviewSteps.map((step, idx) => {
                      const Icon = stepIcon(step.actionType, step.status);
                      const lane = laneIndex(step.toLane);
                      const leftPct = ((lane + 0.5) / laneOrder.length) * 100;
                      const isFocus = overviewHoverStepId === step.id || selectedOverviewStepId === step.id;
                      return (
                        <button
                          key={step.id}
                          onMouseEnter={() => setOverviewHoverStepId(step.id)}
                          onMouseLeave={() => setOverviewHoverStepId(null)}
                          onClick={() => setSelectedOverviewStepId(step.id)}
                          className={cn(
                            'absolute -translate-x-1/2 rounded-md border bg-card px-3 py-2 text-left shadow-sm transition-all duration-150',
                            isFocus ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-ring/60'
                          )}
                          style={{ left: `${leftPct}%`, top: `${idx * 86}px`, width: '220px' }}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 text-xs font-medium"><Icon className="h-3.5 w-3.5" /> {step.fromLane} → {step.toLane}</span>
                            <Badge variant={statusBadgeVariant(step.status)}>{step.status}</Badge>
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{step.actionType}</div>
                          <div className="truncate text-sm">{step.inputSummary} → {step.outputSummary}</div>
                          <div className="mt-1 text-[11px] text-muted-foreground">{step.duration}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="xl:sticky xl:top-4 h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Step Detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!selectedOverviewStep ? (
              <p className="text-muted-foreground">Select a step to inspect details.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-1 text-xs font-mono text-muted-foreground">
                  <div>from/to: {selectedOverviewStep.fromLane} → {selectedOverviewStep.toLane}</div>
                  <div>type: {selectedOverviewStep.actionType}</div>
                  <div>status: {selectedOverviewStep.status}</div>
                  <div>duration: {selectedOverviewStep.duration}</div>
                  <div>timestamp: {new Date(selectedOverviewStep.timestamp).toLocaleString()}</div>
                  {(selectedOverviewStep.inputTokens > 0 || selectedOverviewStep.outputTokens > 0) ? (
                    <>
                      <div>tokens: in {selectedOverviewStep.inputTokens} / out {selectedOverviewStep.outputTokens}</div>
                      <div className="text-emerald-600 dark:text-emerald-400">cost: ${selectedOverviewStep.cost.toFixed(6)}</div>
                    </>
                  ) : null}
                </div>

                <div className="rounded border border-border bg-background/40 p-2">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Input Summary</div>
                  <div>{selectedOverviewStep.inputSummary}</div>
                </div>
                <div className="rounded border border-border bg-background/40 p-2">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Output Summary</div>
                  <div>{selectedOverviewStep.outputSummary}</div>
                </div>

                {selectedOverviewStep.errorMessage ? (
                  <div className="rounded border border-destructive/40 bg-destructive/15 p-2 text-destructive">
                    {selectedOverviewStep.errorMessage}
                  </div>
                ) : null}

                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={overviewShowRaw} onChange={(e) => setOverviewShowRaw(e.target.checked)} />
                  Show raw
                </label>

                {overviewShowRaw ? (
                  <pre className="max-h-64 overflow-auto rounded border border-border bg-background/40 p-2 text-xs text-foreground">
                    {JSON.stringify(selectedOverviewStep.attrs, null, 2)}
                  </pre>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

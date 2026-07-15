import type { Column, DashboardSpec } from './telescope-sdk.js';

/** Options for the agent "Agent" dashboard. */
export interface AgentDashboardOptions {
  /**
   * URL template for deep-linking a run row (a `LinkSpec.href` with `{key}` placeholders filled from the
   * row, e.g. `/agent/runs/{runId}`). Applied to the `runId` column of the runs, tool-calls, approvals
   * and delegations tables. Omit to render plain run ids with no link.
   */
  runHref?: string;
  /** URL template for deep-linking a thread from the recent-runs table, e.g. `/agent/threads/{thread}`. */
  threadHref?: string;
}

/**
 * The "Agent" overview dashboard — run health up top (active runs / token usage / tool-call success
 * rate), then run activity (runs over-time + recent finished runs), then tools & approvals (tool-call
 * volume by status, recent tool calls, recent approval decisions), then delegations & token throughput.
 * Pure data: panels bind to the `agent.*` data providers by name; the `*Href` options add an optional
 * `LinkSpec` on the id columns so a host agent SPA can deep-link a row.
 */
export function agentDashboard(opts: AgentDashboardOptions = {}): DashboardSpec {
  const runCol = (label: string): Column =>
    opts.runHref ? { key: 'runId', label, link: { href: opts.runHref } } : { key: 'runId', label };
  const threadCol: Column = opts.threadHref
    ? { key: 'thread', label: 'Thread', link: { href: opts.threadHref } }
    : { key: 'thread', label: 'Thread' };
  return {
    id: 'agent.overview',
    label: 'Agent',
    panels: [],
    sections: [
      {
        title: 'Runs',
        cols: 3,
        panels: [
          {
            kind: 'stat',
            title: 'Active runs',
            data: { provider: 'agent.activeRuns' },
            spark: false,
          },
          {
            kind: 'stat',
            title: 'Tokens (24h)',
            data: { provider: 'agent.tokenUsage' },
            format: 'number',
            spark: true,
          },
          {
            kind: 'gauge',
            title: 'Tool-call success rate',
            data: { provider: 'agent.toolCallSuccessRate' },
            max: 1,
            format: 'percent',
            thresholds: { warn: 0.95, bad: 0.9, direction: 'down-bad' },
          },
        ],
      },
      {
        title: 'Run activity',
        cols: 2,
        panels: [
          {
            kind: 'timeseries',
            title: 'Runs over time',
            data: { provider: 'agent.runsOverTime' },
            series: ['started', 'finished'],
            style: 'stacked',
          },
          {
            kind: 'table',
            title: 'Recent runs',
            data: { provider: 'agent.recentRuns' },
            columns: [
              { key: 'time', label: 'Time' },
              runCol('Run'),
              threadCol,
              { key: 'steps', label: 'Steps' },
              { key: 'tokens', label: 'Tokens' },
            ],
          },
        ],
      },
      {
        title: 'Tools & approvals',
        cols: 2,
        panels: [
          {
            kind: 'timeseries',
            title: 'Tool calls over time',
            data: { provider: 'agent.toolCallsOverTime' },
            series: ['executed', 'rejected', 'failed'],
            style: 'stacked',
          },
          {
            kind: 'table',
            title: 'Recent tool calls',
            data: { provider: 'agent.recentToolCalls' },
            columns: [
              { key: 'time', label: 'Time' },
              runCol('Run'),
              { key: 'tool', label: 'Tool' },
              { key: 'type', label: 'Type' },
              { key: 'status', label: 'Status' },
            ],
          },
          {
            kind: 'table',
            title: 'Recent approvals',
            data: { provider: 'agent.recentApprovals' },
            columns: [
              { key: 'time', label: 'Time' },
              runCol('Run'),
              { key: 'tool', label: 'Tool' },
              { key: 'status', label: 'Decision' },
            ],
          },
        ],
      },
      {
        title: 'Delegations & tokens',
        cols: 2,
        panels: [
          {
            kind: 'timeseries',
            title: 'Tokens over time',
            data: { provider: 'agent.tokensOverTime' },
            series: ['input', 'output'],
            style: 'stacked',
          },
          {
            kind: 'timeseries',
            title: 'Delegations over time',
            data: { provider: 'agent.delegationsOverTime' },
            series: ['delegations'],
            style: 'area',
          },
          {
            kind: 'table',
            title: 'Recent delegations',
            data: { provider: 'agent.recentDelegations' },
            columns: [
              { key: 'time', label: 'Time' },
              runCol('Run'),
              { key: 'from', label: 'From' },
              { key: 'to', label: 'To' },
            ],
          },
        ],
      },
    ],
  };
}

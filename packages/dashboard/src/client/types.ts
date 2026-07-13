/**
 * Wire shapes returned by the `@adonis-agora/agent` provider's read-only governance routes
 * (`/agent/governance/*`) plus the per-actor `quota/today` route. These MIRROR the target's SPI
 * (`AgentGovernanceQueries` in `src/spi/governance-queries.ts`) exactly — the SPA is a pure consumer,
 * so any drift here is a bug against the server contract, not a local choice.
 */

/** Inclusive UTC-day range, each `YYYY-MM-DD`. Sent as `?from=&to=`. */
export interface GovernanceRange {
  fromDay: string;
  toDay: string;
}

/** `GET /agent/governance/spend/model` — spend + token totals for one model over the range. */
export interface ModelSpendRow {
  modelId: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** `GET /agent/governance/spend/actor` — spend + token totals for one acting ref over the range. */
export interface ActorSpendRow {
  actorRef: string;
  requests: number;
  totalTokens: number;
  costUsd: number;
}

/** `GET /agent/governance/usage/trend` — one point on the daily usage/cost trend. */
export interface UsageTrendPoint {
  day: string;
  totalTokens: number;
  costUsd: number;
}

/** `GET /agent/governance/tool-calls/recent` — a recent tool call for the activity feed. */
export interface ToolCallActivityRow {
  toolCallId: string;
  toolName: string;
  toolType: string;
  status: string;
  threadId: string;
  createdAt: string;
}

/** `GET /agent/governance/threads/recent` — a recent thread with rolled-up activity. */
export interface ThreadActivityRow {
  threadId: string;
  title: string;
  actorRef: string;
  messageCount: number;
  totalTokens: number;
  lastActivityAt: string;
}

/** `GET /agent/quota/today` — the caller's token spend so far today. */
export interface QuotaToday {
  usedTokens: number;
}

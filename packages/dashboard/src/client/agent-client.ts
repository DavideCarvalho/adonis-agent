import { resolveApiBase } from './api-base.js';
import type {
  ActorSpendRow,
  GovernanceRange,
  ModelSpendRow,
  QuotaToday,
  ThreadActivityRow,
  ToolCallActivityRow,
  UsageTrendPoint,
} from './types.js';

/** Thrown on a non-2xx governance response, carrying the HTTP status for the UI to branch on. */
export class AgentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AgentApiError';
  }
}

type FetchLike = typeof fetch;

export interface AgentClientOptions {
  /** Agent API base (e.g. `/agent`). Defaults to the injected/derived base for the current page. */
  baseUrl?: string;
  /** Injectable `fetch` (tests pass a stub). Defaults to the global. */
  fetch?: FetchLike;
  /** Cap for the `recent*` feeds; the server clamps to 200. Defaults to 50. */
  limit?: number;
}

/**
 * A framework-free browser client for the `@adonis-agora/agent` provider's READ surface: the five
 * `/agent/governance/*` rollups plus the per-actor `quota/today`. Same-origin, `credentials:
 * 'same-origin'` so the host's actor/auth cookie gates every call exactly as it gates the routes
 * server-side. No third-party HTTP dependency.
 */
export class AgentClient {
  private readonly base: string;
  private readonly doFetch: FetchLike;
  private readonly limit: number;

  constructor(options: AgentClientOptions = {}) {
    this.base = (options.baseUrl ?? resolveApiBase()).replace(/\/+$/, '');
    this.doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.limit = options.limit ?? 50;
  }

  private async get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const search = new URLSearchParams(query).toString();
    const url = `${this.base}${path}${search ? `?${search}` : ''}`;
    const response = await this.doFetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!response.ok) {
      throw new AgentApiError(`GET ${path} failed (${response.status})`, response.status);
    }
    return (await response.json()) as T;
  }

  spendByModel(range: GovernanceRange): Promise<ModelSpendRow[]> {
    return this.get<ModelSpendRow[]>('/governance/spend/model', {
      from: range.fromDay,
      to: range.toDay,
    });
  }

  spendByActor(range: GovernanceRange): Promise<ActorSpendRow[]> {
    return this.get<ActorSpendRow[]>('/governance/spend/actor', {
      from: range.fromDay,
      to: range.toDay,
    });
  }

  usageTrend(range: GovernanceRange): Promise<UsageTrendPoint[]> {
    return this.get<UsageTrendPoint[]>('/governance/usage/trend', {
      from: range.fromDay,
      to: range.toDay,
    });
  }

  recentToolCalls(limit = this.limit): Promise<ToolCallActivityRow[]> {
    return this.get<ToolCallActivityRow[]>('/governance/tool-calls/recent', {
      limit: String(limit),
    });
  }

  recentThreads(limit = this.limit): Promise<ThreadActivityRow[]> {
    return this.get<ThreadActivityRow[]>('/governance/threads/recent', { limit: String(limit) });
  }

  quotaToday(): Promise<QuotaToday> {
    return this.get<QuotaToday>('/quota/today');
  }
}

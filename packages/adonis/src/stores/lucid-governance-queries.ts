import type {
  ActorSpendRow,
  AgentGovernanceQueries,
  GovernanceRange,
  ModelSpendRow,
  ThreadActivityRow,
  ToolCallActivityRow,
  UsageTrendPoint,
} from '../spi/governance-queries.js';
import type { AgentPricingStore, CurrentModelPrice } from '../spi/pricing-store.js';
import { estimateCost } from '../spi/pricing-store.js';
import { AGENT_TABLES } from './lucid-schema.js';
import type { LucidDatabaseLike } from './lucid.js';

function toInt(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number.parseInt(value, 10) || 0;
  return 0;
}

function toNumOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** The `agent_token_usage` shape the aggregations bucket over, normalized off the raw Lucid row. */
interface UsageRow {
  modelId: string;
  actorRef: string;
  threadId: string;
  /** UTC day (`YYYY-MM-DD`) derived from `created_at` (epoch-ms), matching the store's day semantics. */
  day: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number | null;
  cacheReadTokens: number | null;
  costUsd: number | null;
}

function rowToUsage(row: Record<string, unknown>): UsageRow {
  return {
    modelId: String(row.model_id),
    actorRef: String(row.actor_ref),
    threadId: String(row.thread_id),
    day: new Date(toInt(row.created_at)).toISOString().slice(0, 10),
    inputTokens: toInt(row.input_tokens),
    outputTokens: toInt(row.output_tokens),
    cacheWriteTokens: toNumOrNull(row.cache_write_tokens),
    cacheReadTokens: toNumOrNull(row.cache_read_tokens),
    costUsd: toNumOrNull(row.cost_usd),
  };
}

/**
 * A production {@link AgentGovernanceQueries} — the read/analytics half of the store SPI — backed by
 * AdonisJS **Lucid** (Knex) over the same five agent tables {@link import('./lucid.js').LucidAgentStore}
 * writes. Like the store it touches only the structural {@link LucidDatabaseLike} slice, so
 * `@adonisjs/lucid` stays an *optional peer* (the factory casts the real `db` in).
 *
 * Cost is the token ledger priced against the current prices from the injected {@link AgentPricingStore}
 * (fetched once per query, exactly like the Drizzle/MikroORM references and the loop's cost fold), so a
 * host that binds its own pricing store controls the cost every governance surface reports. A
 * provider-reported `cost_usd` on a usage row always wins; an unpriced model contributes 0 cost (its
 * tokens still count). Omit the pricing store entirely for a zero-cost read-model. Aggregation is
 * in-process (like `quotaToday`) so UTC-day bucketing stays dialect-portable across SQLite/Postgres/MySQL
 * — the behavioral twin of {@link import('../testing/in-memory-governance-queries.js').InMemoryGovernanceQueries}.
 */
export class LucidGovernanceQueries implements AgentGovernanceQueries {
  constructor(
    private readonly db: LucidDatabaseLike,
    private readonly pricingStore?: AgentPricingStore,
  ) {}

  private async loadPricing(): Promise<Map<string, CurrentModelPrice>> {
    const pricing = new Map<string, CurrentModelPrice>();
    if (this.pricingStore === undefined) return pricing;
    for (const price of await this.pricingStore.listCurrentPrices()) {
      pricing.set(price.modelId, price);
    }
    return pricing;
  }

  /** Provider-reported cost wins per row; otherwise the cache-aware token estimate (0 when unpriced). */
  private rowCost(row: UsageRow, pricing: ReadonlyMap<string, CurrentModelPrice>): number {
    if (row.costUsd !== null) return row.costUsd;
    const price = pricing.get(row.modelId);
    if (price === undefined) return 0;
    return estimateCost(
      {
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        ...(row.cacheWriteTokens !== null ? { cacheWriteTokens: row.cacheWriteTokens } : {}),
        ...(row.cacheReadTokens !== null ? { cacheReadTokens: row.cacheReadTokens } : {}),
      },
      price,
    );
  }

  /** The usage ledger rows whose `created_at` falls inside the inclusive UTC-day range. */
  private async usageInRange(range: GovernanceRange): Promise<UsageRow[]> {
    const start = Date.parse(`${range.fromDay}T00:00:00.000Z`);
    const end = Date.parse(`${range.toDay}T23:59:59.999Z`);
    const rows = await this.db
      .from(AGENT_TABLES.tokenUsage)
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .select('*');
    return rows.map(rowToUsage);
  }

  async spendByModel(range: GovernanceRange): Promise<ModelSpendRow[]> {
    const pricing = await this.loadPricing();
    const byModel = new Map<
      string,
      { requests: number; inputTokens: number; outputTokens: number; costUsd: number }
    >();
    for (const row of await this.usageInRange(range)) {
      const bucket = byModel.get(row.modelId) ?? {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
      bucket.requests += 1;
      bucket.inputTokens += row.inputTokens;
      bucket.outputTokens += row.outputTokens;
      bucket.costUsd += this.rowCost(row, pricing);
      byModel.set(row.modelId, bucket);
    }
    const result: ModelSpendRow[] = [];
    for (const [modelId, bucket] of byModel) {
      result.push({ modelId, ...bucket });
    }
    result.sort(
      (left, right) => right.costUsd - left.costUsd || left.modelId.localeCompare(right.modelId),
    );
    return result;
  }

  async spendByActor(range: GovernanceRange): Promise<ActorSpendRow[]> {
    const pricing = await this.loadPricing();
    const byActor = new Map<string, { requests: number; totalTokens: number; costUsd: number }>();
    for (const row of await this.usageInRange(range)) {
      const bucket = byActor.get(row.actorRef) ?? { requests: 0, totalTokens: 0, costUsd: 0 };
      bucket.requests += 1;
      bucket.totalTokens += row.inputTokens + row.outputTokens;
      bucket.costUsd += this.rowCost(row, pricing);
      byActor.set(row.actorRef, bucket);
    }
    const result: ActorSpendRow[] = [];
    for (const [actorRef, bucket] of byActor) {
      result.push({ actorRef, ...bucket });
    }
    result.sort(
      (left, right) => right.costUsd - left.costUsd || left.actorRef.localeCompare(right.actorRef),
    );
    return result;
  }

  async usageTrend(range: GovernanceRange): Promise<UsageTrendPoint[]> {
    const pricing = await this.loadPricing();
    const byDay = new Map<string, { totalTokens: number; costUsd: number }>();
    for (const row of await this.usageInRange(range)) {
      const bucket = byDay.get(row.day) ?? { totalTokens: 0, costUsd: 0 };
      bucket.totalTokens += row.inputTokens + row.outputTokens;
      bucket.costUsd += this.rowCost(row, pricing);
      byDay.set(row.day, bucket);
    }
    const result: UsageTrendPoint[] = [];
    for (const [day, bucket] of byDay) {
      result.push({ day, totalTokens: bucket.totalTokens, costUsd: bucket.costUsd });
    }
    result.sort((left, right) => left.day.localeCompare(right.day));
    return result;
  }

  /**
   * Newest-first recent tool calls, capped at `limit`. Resolves each call's `threadId` through its
   * owning message (the structural query slice has no `join`, so it's one lookup per call — bounded by
   * `limit`, mirroring the reference adapters' N+1 for the recent feeds).
   */
  async recentToolCalls(limit: number): Promise<ToolCallActivityRow[]> {
    const calls = await this.db
      .from(AGENT_TABLES.toolCalls)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .select('*');
    const result: ToolCallActivityRow[] = [];
    for (const call of calls) {
      const message = await this.db
        .from(AGENT_TABLES.messages)
        .where('id', String(call.message_id))
        .first();
      result.push({
        toolCallId: String(call.id),
        toolName: String(call.tool_name),
        toolType: String(call.tool_type),
        status: String(call.status),
        threadId: message === null || message === undefined ? '' : String(message.thread_id),
        createdAt: new Date(toInt(call.created_at)).toISOString(),
      });
    }
    return result;
  }

  /**
   * Newest-first recent threads (soft-deleted excluded, mirroring `listThreads`/the reference), each
   * with its message count and rolled-up token total, capped at `limit`.
   */
  async recentThreads(limit: number): Promise<ThreadActivityRow[]> {
    const threads = await this.db
      .from(AGENT_TABLES.threads)
      .whereNull('deleted_at')
      .orderBy('updated_at', 'desc')
      .limit(limit)
      .select('*');
    const result: ThreadActivityRow[] = [];
    for (const thread of threads) {
      const threadId = String(thread.id);
      const messages = await this.db
        .from(AGENT_TABLES.messages)
        .where('thread_id', threadId)
        .select('id');
      const usageRows = await this.db
        .from(AGENT_TABLES.tokenUsage)
        .where('thread_id', threadId)
        .select('input_tokens', 'output_tokens');
      const totalTokens = usageRows.reduce(
        (sum, row) => sum + toInt(row.input_tokens) + toInt(row.output_tokens),
        0,
      );
      result.push({
        threadId,
        title: String(thread.title),
        actorRef: String(thread.actor_ref),
        messageCount: messages.length,
        totalTokens,
        lastActivityAt: new Date(toInt(thread.updated_at)).toISOString(),
      });
    }
    return result;
  }
}

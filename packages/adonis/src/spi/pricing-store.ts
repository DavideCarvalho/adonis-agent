import type { MessageUsage } from '../types.js';

/**
 * The WRITE side of the model pricing table the loop's cost fold prices token usage against. Cost is
 * `null` (not `0`) for an unpriced model, so an app seeds its models' per-1M rates once (and
 * re-`upsert`s when a provider changes prices). An adapter implements this — `LucidPricingStore`
 * (production, over the `agent_model_pricing` table) and `InMemoryPricingStore` (testing) ship. Wire
 * it in `config/agent.ts` via `pricingStore: pricingStores.lucid()`; use {@link seedModelPrices} for a
 * one-shot batch. Mirrors the reference `AgentPricingStore` contract exactly.
 */

/** A per-1M-token price for one model. Cache rates fall back to the input rate when omitted. */
export interface ModelPriceInput {
  modelId: string;
  inputPricePer1m: number;
  outputPricePer1m: number;
  /** Per-1M price for cache-write (prompt-cache) input tokens. Omit → priced at the input rate. */
  cacheWritePricePer1m?: number;
  /** Per-1M price for cache-read (prompt-cache) input tokens. Omit → priced at the input rate. */
  cacheReadPricePer1m?: number;
}

/** A current price row as read back, with the ISO timestamp it took effect. */
export interface CurrentModelPrice extends ModelPriceInput {
  effectiveFrom: string;
}

export interface AgentPricingStore {
  /**
   * Set the current price for a model. Atomic supersede: the model's prior `is_current` row (if any)
   * is retired and this one is inserted as current, effective now — so the cost fold always joins to
   * exactly one live price per model, with no window where two rows race for `is_current`.
   */
  upsertModelPrice(input: ModelPriceInput): Promise<void>;
  /** The current price row per model (`is_current`), fetched ONCE per run for the loop's cost fold. */
  listCurrentPrices(): Promise<CurrentModelPrice[]>;
}

/** Seed (or refresh) a batch of model prices — one `upsertModelPrice` per row, in order. */
export async function seedModelPrices(
  store: AgentPricingStore,
  prices: ModelPriceInput[],
): Promise<void> {
  for (const price of prices) {
    await store.upsertModelPrice(price);
  }
}

/**
 * Token-ledger estimate for one turn against a pricing row: the uncached input at the input rate,
 * cache-write/cache-read tokens at their own rates (falling back to the input rate when unpriced),
 * plus output at the output rate. Reasoning tokens are a subset of output and are billed at the
 * output rate, so they don't change the estimate. Cache token counts are subsets of `inputTokens`,
 * so the uncached remainder is the difference. Pure — the SQL and in-memory adapters share it, so
 * every surface reports identical numbers.
 */
export function estimateCost(usage: MessageUsage, price: CurrentModelPrice): number {
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
  const cacheReadTokens = usage.cacheReadTokens ?? 0;
  const uncachedInputTokens = usage.inputTokens - cacheWriteTokens - cacheReadTokens;
  return (
    (uncachedInputTokens / 1_000_000) * price.inputPricePer1m +
    (cacheWriteTokens / 1_000_000) * (price.cacheWritePricePer1m ?? price.inputPricePer1m) +
    (cacheReadTokens / 1_000_000) * (price.cacheReadPricePer1m ?? price.inputPricePer1m) +
    (usage.outputTokens / 1_000_000) * price.outputPricePer1m
  );
}

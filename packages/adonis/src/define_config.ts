import type { BrandedFunctionalTool } from './ai-tool-ref.js';
import type { ActorResolver } from './spi/actor-resolver.js';
import type { AttachmentStagingStore } from './spi/attachment-staging.js';
import type { AgentGovernanceQueries } from './spi/governance-queries.js';
import type { ModelProvider } from './spi/model-provider.js';
import type { AgentPricingStore } from './spi/pricing-store.js';
import type { QuotaStore } from './spi/quota-store.js';
import type { Retriever } from './spi/retriever.js';
import type { RolesPolicy } from './spi/roles-policy.js';
import type { TokenStreamSink } from './spi/token-stream-sink.js';
import {
  attachmentStores,
  governanceQueries,
  pricingStores,
  quotas,
  retrievers,
  stores,
} from './stores/factory.js';
import type {
  AttachmentStagingContext,
  AttachmentStagingFactory,
  EmbeddingFactory,
  GovernanceQueriesContext,
  GovernanceQueriesFactory,
  LucidGovernanceConfig,
  LucidPricingConfig,
  LucidStoreConfig,
  MemoryRetrieverConfig,
  MemoryStoreConfig,
  PricingContext,
  PricingFactory,
  QuotaConfig,
  QuotaContext,
  QuotaFactory,
  RetrieverContext,
  RetrieverFactory,
  StoreContext,
  StoreFactory,
} from './stores/factory.js';
import type { ToolTransientRetrySetting } from './tool-retry.js';
import type { AgentDefinition } from './types.js';

/** A lazy factory thunk, so the peer (`ai`/a provider SDK) is imported only when the config loads. */
export type ModelFactory = () => ModelProvider | Promise<ModelProvider>;
/** A lazy {@link TokenStreamSink} factory. Omit to use the in-process sink. */
export type SinkFactory = () => TokenStreamSink | Promise<TokenStreamSink>;

/** The implicit default agent, configured inline — an {@link AgentDefinition} with `name` optional. */
export type DefaultAgentOptions = Omit<AgentDefinition, 'name'> & { name?: string };

/**
 * Shape of `config/agent.ts`. Only `model` is required. Pick a `store` by name from the `stores` map
 * (built with the {@link stores} factory so each peer is imported lazily); omit it for the in-memory
 * store. The default runner is in-process (`durable: false`); the actor resolver defaults to one that
 * THROWS — an identity is never fabricated.
 *
 * ```ts
 * import { defineConfig, stores } from '@adonis-agora/agent'
 * import { aiSdkModel } from '@adonis-agora/agent/ai-sdk'
 *
 * export default defineConfig({
 *   model: () => aiSdkModel({ model: '...' }),
 *   store: 'lucid',
 *   stores: { lucid: stores.lucid(), memory: stores.memory() },
 *   actorResolver: new AuthActorResolver(),
 * })
 * ```
 */
export interface AgentConfig {
  /** The LLM provider, or a lazy factory thunk so the provider SDK peer loads lazily. Required. */
  model: ModelProvider | ModelFactory;
  /** Name of the store (a key of `stores`). Omit for the in-memory store (single-process). */
  store?: string;
  /** Named stores, built with the {@link stores} factory. Provide `lucid` and/or `memory`. */
  stores?: Record<string, StoreFactory>;
  /** Live token transport, or a lazy factory. Defaults to the in-process sink. */
  sink?: TokenStreamSink | SinkFactory;
  /**
   * Daily token budget, or a lazy factory. Omit to disable quotas (fail-open on budget). Use
   * `quotas.ledger({ limitTokens })` to enforce off the persisted token-usage ledger, or
   * `quotas.memory({ limitTokens })` for a single-process budget.
   */
  quota?: QuotaStore | QuotaFactory;
  /**
   * Prices each turn's tokens into the assistant message's `usage.costUsd`. A provider-reported cost
   * (a gateway) always wins; otherwise the loop estimates from this store's current price rows (fetched
   * once per run). Omit → `costUsd` is always `null` (never a fabricated `0`). Use
   * `pricingStores.lucid()` for the SQL-backed table or `pricingStores.memory()` for tests.
   */
  pricingStore?: AgentPricingStore | PricingFactory;
  /**
   * The governance read-model the optional `/agent/governance/*` read routes serve from — per-model /
   * per-actor cost & usage rollups, the daily usage trend, and recent tool-call / thread activity over
   * the persisted agent tables. Pass an {@link AgentGovernanceQueries} instance, or a lazy
   * `governanceQueries.lucid()` factory (which prices its rollups against the configured `pricingStore`).
   * Omit → the governance routes are not mounted. Read-only; safe to leave off.
   */
  governanceQueries?: AgentGovernanceQueries | GovernanceQueriesFactory;
  /**
   * Enables always-on ("inject") RAG: before each turn the loop retrieves passages for the user message
   * and folds them into the system prompt (replay-safe under durable). Pass a {@link Retriever} directly
   * or a lazy factory — `retrievers.memory({ embedder, documents })` for the in-memory cosine store.
   * Omit → no injection. A pgvector/Lucid-backed retriever is deferred.
   */
  retriever?: Retriever | RetrieverFactory;
  /** How many passages inject-mode retrieval requests per run. Default 5. */
  retrievalTopK?: number;
  /**
   * Upload-side seam for message attachments (image/PDF). When set, the provider mounts the optional
   * `POST /agent/attachments` route, which stages an uploaded file through this store and returns a
   * {@link import('./spi/attachment-staging.js').MessageAttachment} the client sends with the next
   * chat message. Pass a store instance, or a lazy `attachmentStores.*()` factory
   * (`attachmentStores.memory()` encodes bytes into a `data:` URL for tests/dev). Omit → no upload
   * route; a client sends already-staged attachment references directly on `chat`.
   */
  attachmentStaging?: AttachmentStagingStore | AttachmentStagingFactory;
  /** Per-file byte cap the upload route enforces. Default 20 MiB. */
  attachmentMaxBytes?: number;
  /** Allowed upload content types. Default: common image types + `application/pdf` + `text/*`. */
  attachmentAllowedContentTypes?: string[];
  /**
   * Tool authorization gate. Defaults to `DefaultToolAuthorizer` (fail-closed, ADMIN-only; role-set
   * intersection). `authorizer` and `rolesPolicy` are aliases — pass either.
   */
  authorizer?: RolesPolicy;
  /** Alias of {@link AgentConfig.authorizer}. */
  rolesPolicy?: RolesPolicy;
  /** Roles a tool requires when it declares none. Defaults to `['ADMIN']`. */
  defaultRoles?: string[];
  /**
   * Resolves the acting actor per request (the identity seam). Defaults to a resolver that THROWS on
   * every request — the agent never fabricates a caller. Wire `AuthActorResolver` / `HeaderActorResolver`.
   */
  actorResolver?: ActorResolver;
  /** Route prefix the `/agent/*` routes mount under. Defaults to `'agent'`. */
  path?: string;
  /**
   * Run each turn as a replay-safe durable workflow (over `@adonis-agora/durable`) instead of
   * in-process: LLM turns / tool executions become memoized durable steps, HITL approval suspends the
   * run on a signal (resuming across a restart), and sub-agent delegation is a tracked child run. Opt
   * in with `true` — requires `@adonis-agora/durable` installed and configured (`config/durable.ts`).
   * If the durable peer can't be wired, the provider logs a warning and falls back to the in-process
   * (inline) runner, so setting it is always safe.
   */
  durable?: boolean;
  /** Additional named agents (an orchestrator delegates to them via `delegatesTo`). */
  agents?: AgentDefinition[];
  /** The implicit single agent's config (base prompt, personas, tool allow-list). Omit for a bare assistant. */
  defaultAgent?: DefaultAgentOptions;
  /** Static functional tools (`defineTool(...)`) to register at boot, in addition to discovery. */
  tools?: BrandedFunctionalTool[];
  /** Cap on model↔tool iterations per turn. Default 8. */
  maxSteps?: number;
  /**
   * Retries a tool's own invocation, in place, when it throws a classified-transient error (a DB
   * deadlock, a lock-wait timeout, a serialization failure) — a bounded retry inside the tool's
   * durable step, so a replay reuses the memoized result and side effects run once. Default ON
   * (`{ attempts: 2, backoffMs: 150 }` with the default classifier); pass `{ classify }` to
   * widen/narrow which errors count as transient, or `false` to disable. Non-transient failures are
   * never retried — they stay a one-shot business outcome.
   */
  toolTransientRetry?: ToolTransientRetrySetting;
  /** Emit `agora:agent:*` diagnostics events when `@adonis-agora/diagnostics` is installed. Default true. */
  emitDiagnostics?: boolean;
}

/** Identity helper giving `config/agent.ts` full type-checking. */
export function defineConfig(config: AgentConfig): AgentConfig {
  return config;
}

export { stores, quotas, pricingStores, governanceQueries, retrievers, attachmentStores };
export type {
  StoreContext,
  StoreFactory,
  LucidStoreConfig,
  MemoryStoreConfig,
  QuotaContext,
  QuotaFactory,
  QuotaConfig,
  PricingContext,
  PricingFactory,
  LucidPricingConfig,
  GovernanceQueriesContext,
  GovernanceQueriesFactory,
  LucidGovernanceConfig,
  RetrieverContext,
  RetrieverFactory,
  MemoryRetrieverConfig,
  EmbeddingFactory,
  AttachmentStagingContext,
  AttachmentStagingFactory,
};

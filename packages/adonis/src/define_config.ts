import type { BrandedFunctionalTool } from './ai-tool-ref.js';
import type { ActorResolver } from './spi/actor-resolver.js';
import type { ModelProvider } from './spi/model-provider.js';
import type { QuotaStore } from './spi/quota-store.js';
import type { RolesPolicy } from './spi/roles-policy.js';
import type { TokenStreamSink } from './spi/token-stream-sink.js';
import { stores } from './stores/factory.js';
import type { LucidStoreConfig, MemoryStoreConfig, StoreContext, StoreFactory } from './stores/factory.js';
import type { AgentDefinition } from './types.js';

/** A lazy factory thunk, so the peer (`ai`/a provider SDK) is imported only when the config loads. */
export type ModelFactory = () => ModelProvider | Promise<ModelProvider>;
/** A lazy {@link TokenStreamSink} factory. Omit to use the in-process sink. */
export type SinkFactory = () => TokenStreamSink | Promise<TokenStreamSink>;
/** A lazy {@link QuotaStore} factory. Omit to disable quotas (matching the source's default). */
export type QuotaFactory = () => QuotaStore | Promise<QuotaStore>;

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
  /** Daily token budget, or a lazy factory. Omit to disable quotas (fail-open on budget). */
  quota?: QuotaStore | QuotaFactory;
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
   * Run each turn as a durable workflow instead of in-process. DEFERRED — not yet supported; setting
   * it logs a warning and falls back to the in-process (inline) runner.
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
  /** Emit `agora:agent:*` diagnostics events when `@adonis-agora/diagnostics` is installed. Default true. */
  emitDiagnostics?: boolean;
}

/** Identity helper giving `config/agent.ts` full type-checking. */
export function defineConfig(config: AgentConfig): AgentConfig {
  return config;
}

export { stores };
export type { StoreContext, StoreFactory, LucidStoreConfig, MemoryStoreConfig };

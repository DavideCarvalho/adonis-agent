import type { ApplicationService } from '@adonisjs/core/types';
import type { AgentStore } from '../spi/agent-store.js';
import type { LucidDatabaseLike } from './lucid.js';

/**
 * Runtime context a {@link StoreFactory} thunk receives when the agent provider builds the configured
 * store at boot. Carries the booted application so a driver can resolve a peer's service if it needs to.
 */
export interface StoreContext {
  app: ApplicationService;
}

/**
 * A configured agent store: a thunk the agent provider calls at boot to build the {@link AgentStore}.
 * Each factory lazily imports its peer dependency (`@adonisjs/lucid`) inside the thunk, so the driver
 * is only loaded when it is actually selected — keeping that package optional.
 */
export type StoreFactory = (ctx: StoreContext) => Promise<AgentStore>;

/** Options for the Lucid-backed persistent store. */
export interface LucidStoreConfig {
  /** Lucid connection name to use. Defaults to the `Database` default connection. */
  connection?: string;
  /**
   * Create the five agent tables on first use (no migration). Handy for tests/scripts; production
   * should run the published migration. Default `false`.
   */
  autoCreateTables?: boolean;
}

/** Options for the in-memory store (single-process, non-durable). */
export type MemoryStoreConfig = Record<string, never>;

/**
 * The store factory namespace used in `config/agent.ts`:
 *
 * ```ts
 * import { defineConfig, stores } from '@adonis-agora/agent'
 *
 * export default defineConfig({
 *   store: 'lucid',
 *   stores: {
 *     memory: stores.memory(),
 *     lucid: stores.lucid({ connection: 'pg' }),
 *   },
 * })
 * ```
 *
 * Each factory returns a {@link StoreFactory} — a lazy thunk. Calling it in the config file costs
 * nothing; the peer dependency is only imported when the provider builds the selected store at boot.
 */
export const stores = {
  /** In-memory store — single-process, non-durable. Handy for tests and scratch/dev apps. */
  memory(_config: MemoryStoreConfig = {}): StoreFactory {
    return async () => {
      const { InMemoryAgentStore } = await import('../testing/in-memory-store.js');
      return new InMemoryAgentStore();
    };
  },

  /** Persist threads/messages/tool-calls/usage in SQL via `@adonisjs/lucid`. */
  lucid(config: LucidStoreConfig = {}): StoreFactory {
    return async () => {
      const db = (await import('@adonisjs/lucid/services/db')).default;
      const { LucidAgentStore } = await import('./lucid.js');
      const client = (config.connection !== undefined
        ? db.connection(config.connection)
        : db) as unknown as LucidDatabaseLike;
      return new LucidAgentStore(client, {
        ...(config.autoCreateTables !== undefined
          ? { autoCreateTables: config.autoCreateTables }
          : {}),
      });
    };
  },
};

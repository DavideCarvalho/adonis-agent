import type { LucidDatabaseLike } from './lucid.js';

/**
 * The five agent table names. They match the cross-adapter snake_case contract the reference Drizzle
 * store uses, so a dashboard or migration can point at any adapter and see the same physical schema.
 */
export const AGENT_TABLES = {
  threads: 'agent_thread',
  messages: 'agent_message',
  toolCalls: 'agent_tool_call',
  tokenUsage: 'agent_token_usage',
  modelPricing: 'agent_model_pricing',
} as const;

/**
 * `CREATE TABLE IF NOT EXISTS` DDL for the five agent tables plus their indexes, one statement per
 * array element so each can be issued through Lucid's `rawQuery`. Portable across SQLite / Postgres /
 * MySQL: quoted identifiers, epoch-ms `BIGINT` timestamps, `INTEGER` booleans (0/1) and `TEXT` JSON
 * columns — no dialect-only types. A real deployment should prefer the bundled migration stub so the
 * schema is versioned; this helper lets a store stand itself up in tests and scripts.
 *
 * The tool-call PK is the model-supplied `toolCallId` (not a generated id), preserving the invariant
 * that a persisted tool call is addressable by exactly the id the model emitted.
 */
export function createTableStatements(): string[] {
  const t = AGENT_TABLES;
  return [
    `CREATE TABLE IF NOT EXISTS "${t.threads}" (
      "id" VARCHAR(255) PRIMARY KEY NOT NULL,
      "actor_ref" VARCHAR(255) NOT NULL,
      "tenant_ref" VARCHAR(255) NULL,
      "title" TEXT NOT NULL,
      "persona" VARCHAR(255) NOT NULL DEFAULT 'default',
      "transient" INTEGER NOT NULL DEFAULT 0,
      "pinned_at" BIGINT NULL,
      "summary" TEXT NULL,
      "summary_message_count" INTEGER NOT NULL DEFAULT 0,
      "active_stream_id" VARCHAR(255) NULL,
      "created_at" BIGINT NOT NULL,
      "updated_at" BIGINT NOT NULL,
      "deleted_at" BIGINT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "${t.threads}_actor_updated_idx" ON "${t.threads}" ("actor_ref", "updated_at")`,
    `CREATE TABLE IF NOT EXISTS "${t.messages}" (
      "id" VARCHAR(255) PRIMARY KEY NOT NULL,
      "thread_id" VARCHAR(255) NOT NULL REFERENCES "${t.threads}" ("id") ON DELETE CASCADE,
      "role" VARCHAR(255) NOT NULL,
      "content" TEXT NOT NULL,
      "tool_calls" TEXT NULL,
      "tool_results" TEXT NULL,
      "attachments" TEXT NULL,
      "follow_ups" TEXT NULL,
      "usage" TEXT NULL,
      "persona" VARCHAR(255) NULL,
      "created_at" BIGINT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "${t.messages}_thread_created_idx" ON "${t.messages}" ("thread_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "${t.toolCalls}" (
      "id" VARCHAR(255) PRIMARY KEY NOT NULL,
      "message_id" VARCHAR(255) NOT NULL REFERENCES "${t.messages}" ("id") ON DELETE CASCADE,
      "tool_name" VARCHAR(255) NOT NULL,
      "tool_type" VARCHAR(255) NOT NULL,
      "input" TEXT NULL,
      "output" TEXT NULL,
      "status" VARCHAR(255) NOT NULL,
      "executed_by_ref" VARCHAR(255) NULL,
      "execution_ms" INTEGER NULL,
      "error" TEXT NULL,
      "created_at" BIGINT NOT NULL,
      "executed_at" BIGINT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "${t.tokenUsage}" (
      "id" VARCHAR(255) PRIMARY KEY NOT NULL,
      "thread_id" VARCHAR(255) NOT NULL REFERENCES "${t.threads}" ("id") ON DELETE CASCADE,
      "actor_ref" VARCHAR(255) NOT NULL,
      "message_id" VARCHAR(255) NULL,
      "model_id" VARCHAR(255) NOT NULL,
      "purpose" VARCHAR(255) NOT NULL,
      "input_tokens" INTEGER NOT NULL,
      "output_tokens" INTEGER NOT NULL,
      "cache_write_tokens" INTEGER NULL,
      "cache_read_tokens" INTEGER NULL,
      "cost_usd" DOUBLE PRECISION NULL,
      "created_at" BIGINT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "${t.tokenUsage}_actor_created_idx" ON "${t.tokenUsage}" ("actor_ref", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "${t.modelPricing}" (
      "id" VARCHAR(255) PRIMARY KEY NOT NULL,
      "model_id" VARCHAR(255) NOT NULL,
      "input_price_per_1m" DOUBLE PRECISION NOT NULL,
      "output_price_per_1m" DOUBLE PRECISION NOT NULL,
      "cache_write_price_per_1m" DOUBLE PRECISION NULL,
      "cache_read_price_per_1m" DOUBLE PRECISION NULL,
      "effective_from" BIGINT NOT NULL,
      "is_current" INTEGER NOT NULL
    )`,
  ];
}

/**
 * Idempotently provision the five agent tables through Lucid's async raw runner (`CREATE TABLE IF
 * NOT EXISTS`). Works on every Lucid dialect. For an AdonisJS app prefer the published migration
 * (`node ace configure @adonis-agora/agent`); this helper is for standalone use, tests and quick-starts.
 */
export async function createAgentTables(db: LucidDatabaseLike): Promise<void> {
  for (const stmt of createTableStatements()) {
    await db.rawQuery(stmt);
  }
}

import type { LucidDatabaseLike } from './lucid.js';

/**
 * The six agent table names. They match the cross-adapter snake_case contract the reference Drizzle
 * store uses, so a dashboard or migration can point at any adapter and see the same physical schema.
 */
export const AGENT_TABLES = {
  threads: 'agent_thread',
  messages: 'agent_message',
  toolCalls: 'agent_tool_call',
  tokenUsage: 'agent_token_usage',
  modelPricing: 'agent_model_pricing',
  runs: 'agent_run',
} as const;

/**
 * `CREATE TABLE IF NOT EXISTS` DDL for the six agent tables plus their indexes, one statement per
 * array element so each can be issued through Lucid's `rawQuery`. Portable across SQLite / Postgres /
 * MySQL: quoted identifiers, epoch-ms `BIGINT` timestamps, `INTEGER` booleans (0/1) and `TEXT` JSON
 * columns — no dialect-only types. A real deployment should prefer the bundled migration stub so the
 * schema is versioned; this helper lets a store stand itself up in tests and scripts.
 *
 * The tool-call PK is the model-supplied `toolCallId` (not a generated id), preserving the invariant
 * that a persisted tool call is addressable by exactly the id the model emitted.
 *
 * The `agent_run` table records each run (turn) lifecycle; `agent_message` / `agent_tool_call` /
 * `agent_token_usage` each carry a nullable `run_id` correlation column (logically referencing
 * `agent_run.id`, deliberately WITHOUT a DB-level foreign key — like the reference — so the additive
 * migration can `ALTER TABLE ADD COLUMN` portably and a row recorded before run tracking shipped can
 * keep a `null` run_id).
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
      "run_id" VARCHAR(255) NULL,
      "created_at" BIGINT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "${t.messages}_thread_created_idx" ON "${t.messages}" ("thread_id", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "${t.messages}_run_idx" ON "${t.messages}" ("run_id")`,
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
      "run_id" VARCHAR(255) NULL,
      "created_at" BIGINT NOT NULL,
      "executed_at" BIGINT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "${t.toolCalls}_run_idx" ON "${t.toolCalls}" ("run_id")`,
    `CREATE INDEX IF NOT EXISTS "${t.toolCalls}_status_created_idx" ON "${t.toolCalls}" ("status", "created_at")`,
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
      "run_id" VARCHAR(255) NULL,
      "created_at" BIGINT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "${t.tokenUsage}_actor_created_idx" ON "${t.tokenUsage}" ("actor_ref", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "${t.tokenUsage}_run_idx" ON "${t.tokenUsage}" ("run_id")`,
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
    `CREATE TABLE IF NOT EXISTS "${t.runs}" (
      "id" VARCHAR(255) PRIMARY KEY NOT NULL,
      "thread_id" VARCHAR(255) NOT NULL REFERENCES "${t.threads}" ("id") ON DELETE CASCADE,
      "agent_name" VARCHAR(255) NULL,
      "actor_ref" VARCHAR(255) NOT NULL,
      "tenant_ref" VARCHAR(255) NULL,
      "status" VARCHAR(255) NOT NULL,
      "started_at" BIGINT NOT NULL,
      "finished_at" BIGINT NULL,
      "step_count" INTEGER NOT NULL DEFAULT 0,
      "input_tokens" INTEGER NOT NULL DEFAULT 0,
      "output_tokens" INTEGER NOT NULL DEFAULT 0,
      "cost_usd" DOUBLE PRECISION NULL,
      "error" TEXT NULL,
      "durable" INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS "${t.runs}_started_idx" ON "${t.runs}" ("started_at")`,
    `CREATE INDEX IF NOT EXISTS "${t.runs}_actor_started_idx" ON "${t.runs}" ("actor_ref", "started_at")`,
    `CREATE INDEX IF NOT EXISTS "${t.runs}_status_started_idx" ON "${t.runs}" ("status", "started_at")`,
  ];
}

/**
 * Idempotently provision the six agent tables through Lucid's async raw runner (`CREATE TABLE IF
 * NOT EXISTS`). Works on every Lucid dialect. For an AdonisJS app prefer the published migration
 * (`node ace configure @adonis-agora/agent`); this helper is for standalone use, tests and quick-starts.
 */
export async function createAgentTables(db: LucidDatabaseLike): Promise<void> {
  for (const stmt of createTableStatements()) {
    await db.rawQuery(stmt);
  }
}

import type Configure from '@adonisjs/core/commands/configure';
import { stubsRoot } from './stubs/main.js';

/**
 * `node ace configure @adonis-agora/agent` — auto-wires the package:
 *
 * 1. registers the agent service provider in `adonisrc.ts`;
 * 2. registers the Assembler `init` hook that generates the typed `app/agent_tools` barrel at
 *    build/dev time (the provider imports it instead of scanning at runtime; it falls back to the
 *    runtime scan when the barrel is absent);
 * 3. publishes `config/agent.ts`;
 * 4. publishes the Lucid migration for the five agent tables (run `node ace migration:run`; delete it
 *    if you only use the in-memory store);
 * 5. publishes the additive run-tracking migration (`agent_run` table + `run_id` columns) — run it
 *    after the base migration; delete it with the base one if you only use the in-memory store;
 * 6. publishes the pgvector migration for the RAG chunk table (Postgres + pgvector only; delete it
 *    unless you use `retrievers.pgvector({...})`).
 */
export async function configure(command: Configure) {
  const codemods = await command.createCodemods();

  await codemods.updateRcFile((rcFile) => {
    rcFile.addProvider('@adonis-agora/agent/agent_provider');
    // Generate the typed app/agent_tools barrel at build/dev time (replaces the runtime readdir scan).
    rcFile.addAssemblerHook('init', '@adonis-agora/agent/hooks/tools');
  });

  await codemods.makeUsingStub(stubsRoot, 'config/agent.stub', {});
  await codemods.makeUsingStub(stubsRoot, 'database/migrations/create_agent_tables.stub', {});
  await codemods.makeUsingStub(stubsRoot, 'database/migrations/create_agent_run_tracking.stub', {});
  await codemods.makeUsingStub(stubsRoot, 'database/migrations/create_agent_rag_chunks.stub', {});
}

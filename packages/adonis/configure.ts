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
 *    if you only use the in-memory store).
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
}

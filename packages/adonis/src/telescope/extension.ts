import { type AgentDashboardOptions, agentDashboard } from './dashboard.js';
import {
  agentActiveRunsProvider,
  agentDelegationsOverTimeProvider,
  agentRecentApprovalsProvider,
  agentRecentDelegationsProvider,
  agentRecentRunsProvider,
  agentRecentToolCallsProvider,
  agentRunsOverTimeProvider,
  agentTokenUsageProvider,
  agentTokensOverTimeProvider,
  agentToolCallSuccessRateProvider,
  agentToolCallsOverTimeProvider,
} from './data-providers.js';
import type { TelescopeExtension } from './telescope-sdk.js';

/**
 * The first-class `@adonis-agora/telescope` extension for `@adonis-agora/agent` (the "Agent" tab): an
 * "Agent" overview dashboard surfacing recent runs, tool calls, approval decisions, delegations and
 * token usage, plus the data providers the panels bind to. Wire it into `config/telescope.ts`:
 *
 * ```ts
 * import { defineConfig } from '@adonis-agora/telescope'
 * import { agentTelescopeExtension } from '@adonis-agora/agent/telescope'
 *
 * export default defineConfig({ extensions: [agentTelescopeExtension()] })
 * ```
 *
 * No watcher is contributed — `@adonis-agora/agent` already publishes `agora:agent:*` lifecycle events
 * onto the diagnostics bus (`src/diagnostics.ts`), and Telescope's generic diagnostics watcher records
 * them as `type: 'diagnostic'`, `tag: 'lib:agent'`; the entry-backed providers read those recorded
 * entries. `@adonis-agora/telescope` stays an OPTIONAL, never-imported peer — see `telescope-sdk.ts` for
 * why the returned object structurally (not nominally) satisfies its `TelescopeExtension` contract, and
 * why no NestJS-style DI/read-model is resolved (unlike the aviary port; capture is entirely entry-backed).
 *
 * No `entryTypes` are contributed: agent events are recorded under the generic `diagnostic` entry type
 * (`tag: 'lib:agent'`), so there is no dedicated `agent` entry type to navigate to — the "Agent"
 * dashboard is the entry point. (Same reasoning as `@adonis-agora/media/telescope`.)
 */
export function agentTelescopeExtension(opts: AgentDashboardOptions = {}): TelescopeExtension {
  return {
    name: 'agent',
    dashboards: () => [agentDashboard(opts)],
    dataProviders: () => [
      agentActiveRunsProvider(),
      agentTokenUsageProvider(),
      agentToolCallSuccessRateProvider(),
      agentRunsOverTimeProvider(),
      agentTokensOverTimeProvider(),
      agentRecentRunsProvider(),
      agentToolCallsOverTimeProvider(),
      agentRecentToolCallsProvider(),
      agentRecentApprovalsProvider(),
      agentDelegationsOverTimeProvider(),
      agentRecentDelegationsProvider(),
    ],
  };
}

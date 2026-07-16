import type { Actor } from '@adonis-agora/agent';
import type { HttpContext } from '@adonisjs/core/http';

/**
 * An extra authorization gate for the dashboard, run AFTER the agent config's `actorResolver` has
 * resolved the caller. Return `false` (or throw) to deny — the request gets `403`. The governance
 * read-model the SPA serves spans EVERY actor's spend/usage, so most apps restrict the console beyond
 * mere authentication, e.g. `(actor) => actor.roles?.includes('ADMIN') ?? false`.
 */
export type AgentDashboardAuthorize = (
  actor: Actor,
  ctx: HttpContext,
) => boolean | Promise<boolean>;

/**
 * Optional `config('agent').dashboard` block. The dashboard reuses the agent config's `path` and
 * `actorResolver` (so it sits behind the SAME actor gating as the governance routes); this block
 * toggles it on/off, optionally overrides the mount path, and optionally adds an `authorize` gate.
 */
export interface AgentDashboardConfig {
  /** Mount the SPA. Default `true` — set `false` to keep the routes off entirely. */
  enabled?: boolean;
  /** Override the mount path. Default `<agentPath>/dashboard`. */
  path?: string;
  /**
   * Extra authorization run after the actor resolves. Return `false` to deny (`403`). Omit to allow
   * any resolved actor (the default), matching the `/agent/governance/*` routes' gating.
   */
  authorize?: AgentDashboardAuthorize;
}

export interface ResolvedAgentDashboardConfig {
  enabled: boolean;
  path?: string;
  authorize?: AgentDashboardAuthorize;
}

/** Fill defaults for the optional dashboard config block. */
export function resolveDashboardConfig(
  config: AgentDashboardConfig | undefined,
): ResolvedAgentDashboardConfig {
  const resolved: ResolvedAgentDashboardConfig = { enabled: config?.enabled ?? true };
  if (config?.path !== undefined) resolved.path = config.path;
  if (config?.authorize !== undefined) resolved.authorize = config.authorize;
  return resolved;
}

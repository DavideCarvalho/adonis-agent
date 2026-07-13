/**
 * Optional `config('agent').dashboard` block. The dashboard reuses the agent config's `path` and
 * `actorResolver` (so it sits behind the SAME actor gating as the governance routes); this block only
 * toggles it on/off and optionally overrides the mount path.
 */
export interface AgentDashboardConfig {
  /** Mount the SPA. Default `true` — set `false` to keep the routes off entirely. */
  enabled?: boolean;
  /** Override the mount path. Default `<agentPath>/dashboard`. */
  path?: string;
}

export interface ResolvedAgentDashboardConfig {
  enabled: boolean;
  path?: string;
}

/** Fill defaults for the optional dashboard config block. */
export function resolveDashboardConfig(
  config: AgentDashboardConfig | undefined,
): ResolvedAgentDashboardConfig {
  const enabled = config?.enabled ?? true;
  return config?.path !== undefined ? { enabled, path: config.path } : { enabled };
}

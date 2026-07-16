import type { ActorResolver } from '@adonis-agora/agent';
import type { HttpContext } from '@adonisjs/core/http';
import type { AgentDashboardAuthorize } from './define_config.js';

/** The outcome of the dashboard access gate: proceed, or deny with an HTTP status + message. */
export type DashboardGateVerdict = { ok: true } | { ok: false; status: 401 | 403; error: string };

/**
 * Decide whether a request may reach the dashboard, WITHOUT touching the response — so it is unit
 * testable free of the AdonisJS router/app. Mirrors the `/agent/governance/*` gating: resolve the
 * actor through the agent config's resolver (missing/failed → `401`), then run the optional
 * `authorize` gate over the resolved actor (denied/threw → `403`). No resolver and no `authorize`
 * means the SPA is exposed to any request — the caller (the provider) is expected to short-circuit on
 * a missing resolver via the `401` here.
 */
export async function evaluateDashboardGate(
  ctx: HttpContext,
  actorResolver: ActorResolver | undefined,
  authorize?: AgentDashboardAuthorize,
): Promise<DashboardGateVerdict> {
  if (actorResolver === undefined) {
    return { ok: false, status: 401, error: 'no actor resolver configured' };
  }
  let actor: Awaited<ReturnType<ActorResolver['resolve']>>;
  try {
    actor = await actorResolver.resolve(ctx);
  } catch (error) {
    return {
      ok: false,
      status: 401,
      error: error instanceof Error ? error.message : 'unauthorized',
    };
  }
  if (authorize !== undefined) {
    try {
      if (!(await authorize(actor, ctx))) {
        return { ok: false, status: 403, error: 'forbidden' };
      }
    } catch (error) {
      return {
        ok: false,
        status: 403,
        error: error instanceof Error ? error.message : 'forbidden',
      };
    }
  }
  return { ok: true };
}

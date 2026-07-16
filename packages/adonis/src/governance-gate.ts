import type { HttpContext } from '@adonisjs/core/http';
import type { Actor } from './types.js';

/**
 * Optional authorization gate for the cross-actor `/agent/governance/*` read routes. It runs AFTER
 * the actor is resolved (so the caller is already authenticated), and decides whether THIS actor may
 * read the platform-wide governance read-model (every actor's spend/usage/threads/approvals). Return
 * `false` to deny (the route replies `403`). Omit the gate entirely and any resolved actor may read
 * governance — the historical behavior, correct only when every authenticated caller is trusted staff.
 *
 * Mirrors `@adonis-agora/agent-dashboard`'s `authorize` hook so the JSON routes and the console SPA
 * that reads them can be gated with the SAME predicate (typically "actor is ADMIN").
 */
export type AgentGovernanceAuthorize = (
  actor: Actor,
  ctx: HttpContext,
) => boolean | Promise<boolean>;

/** The decision {@link evaluateGovernanceGate} returns: proceed, or reply `status` with `error`. */
export interface GovernanceGateVerdict {
  ok: boolean;
  /** The HTTP status to reply when `!ok` (always `403` here — the caller is already authenticated). */
  status: number;
  error?: string;
}

/**
 * Decide whether an already-resolved actor may read the governance routes — the router-free core of
 * the provider's governance gate, extracted so it can be unit tested without booting an app.
 *
 * - No `authorize` configured → `{ ok: true }` (governance open to any resolved actor).
 * - `authorize` returns truthy → `{ ok: true }`.
 * - `authorize` returns falsy → `{ ok: false, status: 403 }`.
 * - `authorize` throws → `{ ok: false, status: 403 }` (fail-closed; the error message is surfaced).
 */
export async function evaluateGovernanceGate(
  actor: Actor,
  ctx: HttpContext,
  authorize?: AgentGovernanceAuthorize,
): Promise<GovernanceGateVerdict> {
  if (authorize === undefined) return { ok: true, status: 200 };
  try {
    const allowed = await authorize(actor, ctx);
    return allowed ? { ok: true, status: 200 } : { ok: false, status: 403, error: 'forbidden' };
  } catch (error) {
    return {
      ok: false,
      status: 403,
      error: error instanceof Error ? error.message : 'forbidden',
    };
  }
}

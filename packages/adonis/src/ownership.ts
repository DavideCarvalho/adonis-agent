/** The decision {@link evaluateOwnership} returns: proceed, or reply `status` with `error`. */
export interface OwnershipVerdict {
  ok: boolean;
  /** `200` when ok; `404` when the target is unknown; `403` when the actor neither owns it nor is privileged. */
  status: number;
  error?: string;
}

/**
 * Object-level authorization for a per-actor resource (a run or thread) addressed by id: decide
 * whether `actorId` may act on a resource whose owner is `ownerRef`. The router-free core of the
 * provider's run/thread ownership checks, extracted so it can be unit tested without booting an app.
 *
 * - `ownerRef === null` (unknown resource) → `{ ok: false, status: 404 }`. Returning 404 (not 403)
 *   avoids confirming to a non-owner whether an id they don't own exists.
 * - `ownerRef === actorId` (the caller owns it) → `{ ok: true }`.
 * - `privileged` (a cross-actor privileged caller, e.g. an admin that passes the governance gate) →
 *   `{ ok: true }` even on a resource it does not own.
 * - otherwise → `{ ok: false, status: 403 }`.
 */
export function evaluateOwnership(
  actorId: string,
  ownerRef: string | null,
  privileged: boolean,
): OwnershipVerdict {
  if (ownerRef === null) return { ok: false, status: 404, error: 'not found' };
  if (ownerRef === actorId) return { ok: true, status: 200 };
  if (privileged) return { ok: true, status: 200 };
  return { ok: false, status: 403, error: 'forbidden' };
}

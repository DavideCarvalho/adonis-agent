import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Actor } from '../types.js';

/**
 * Read the acting {@link Actor} from the transport's verified `AuthInfo`. The MCP auth strategies
 * (`authKitAuth`/`apiKeyAuth`) and the open-mode fallback all attach it to `extra.actor` as a typed
 * `McpAuthInfo` (`extra: { actor: Actor }`), so no runtime guard is needed on the happy path — this
 * exists to resolve the actor from a generic SDK `AuthInfo` safely. Throws a clear error when absent
 * or malformed so a request without a resolvable identity never reaches the tool registry.
 */
export function actorFromAuthInfo(authInfo: AuthInfo | undefined): Actor {
  const actor = authInfo?.extra?.actor;
  if (!isActor(actor)) {
    throw new Error('unauthorized: no actor associated with this MCP request');
  }
  return actor;
}

/**
 * Runtime shape check for the {@link Actor} attached to an MCP `AuthInfo.extra`: a non-null object
 * with a string `id` and, when present, a `roles` array of strings. `roles`/`tenantRef` stay
 * optional per `Actor`.
 */
export function isActor(value: unknown): value is Actor {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Actor>;
  if (typeof candidate.id !== 'string') return false;
  if (candidate.roles !== undefined) {
    if (!Array.isArray(candidate.roles)) return false;
    if (!candidate.roles.every((role) => typeof role === 'string')) return false;
  }
  return true;
}

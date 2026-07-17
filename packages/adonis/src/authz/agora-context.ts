/**
 * Structural, dependency-free reader for the Agora runtime context — mirrors
 * `@adonis-agora/authz`'s `agora/context.ts`. The Agora context library publishes a READ accessor
 * on the well-known symbol slot. We never import that package; when the slot is absent (context not
 * installed) the reader degrades to `undefined` and the caller fails closed.
 */

/** The symbol slot the Agora context library writes its read accessor into. */
export const AGORA_CONTEXT_ACCESSOR = Symbol.for('@agora/context:accessor');

/**
 * The slice of the context accessor this package reads. `userRef` and `tenantId` are direct
 * accessor fields (authkit writes them via the `set` slot); we never read `globalRoles` here —
 * authz's `effectiveRoles` does that internally.
 */
export interface AgoraContextAccessor {
  tenantId?: string;
  userRef?: { type?: string; id?: string | number };
  get?: () => unknown;
}

/** Read the active Agora context accessor from the global slot, if present. */
export function readContextAccessor(): AgoraContextAccessor | undefined {
  const slot = (globalThis as Record<symbol, unknown>)[AGORA_CONTEXT_ACCESSOR];
  if (slot == null || typeof slot !== 'object') return undefined;
  return slot as AgoraContextAccessor;
}

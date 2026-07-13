/**
 * Optional read-side lookup from opaque `actorRef`s to human display labels.
 *
 * The agent store keeps an `actorRef` opaque by design (no FK into the host's user table — hosts own
 * their own identity schema). That is fine for enforcement and accounting, but a governance/dashboard
 * read surface showing a raw ref (`"u_8f21..."`) instead of a name is a poor experience. Binding an
 * `ActorDirectory` via `defineConfig({ actorDirectory })` lets those surfaces resolve refs to labels;
 * leaving it unbound just means they render the raw ref.
 *
 * This is the read-side dual of the {@link import('./actor-resolver.js').ActorResolver} write seam:
 * the resolver turns an inbound request into an acting `Actor`, the directory turns a persisted
 * `actorRef` back into something a human can read. Configure one with a factory (e.g.
 * `actorDirectories.memory({ labels })`) or your own implementation over the host's user table.
 */
export interface ActorDirectory {
  /**
   * Resolve opaque actor refs to display labels. The returned map is keyed by the input ref; a ref
   * with no known label may be omitted (callers fall back to rendering the raw ref). Never throws for
   * an unknown ref — a missing entry is a normal, expected outcome.
   */
  resolveDisplay(refs: readonly string[]): Promise<Record<string, string>>;
}

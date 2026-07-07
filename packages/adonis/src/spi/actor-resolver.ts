import type { Actor } from '../types.js';

/**
 * Resolves the acting {@link Actor} for an inbound request. This is the identity seam:
 * the agent NEVER fabricates a caller. Configure one via `defineConfig({ actorResolver })`
 * that reads your authenticated principal (Adonis `ctx.auth.user`, a verified session/JWT, ...).
 *
 * When no resolver is configured, the provider installs the `UnconfiguredActorResolver`, which
 * throws on every request — an identity is never invented from a default. See `HeaderActorResolver`
 * for a header-based resolver suitable for demos and gateways that strip/re-set the headers, and
 * `AuthActorResolver` for reading Adonis's `ctx.auth.user`.
 *
 * `req` is the transport request object, typed `unknown` to keep core framework-agnostic;
 * an AdonisJS app receives the `HttpContext`.
 */
export interface ActorResolver {
  resolve(req: unknown): Actor | Promise<Actor>;
}

# `authzActorResolver` — seamless actor resolution for `@adonis-agora/agent`

**Lib:** `@adonis-agora/agent` (`packages/adonis`)
**Adopter:** `apps/entre-textos` (`streaming-educacao`)
**Date:** 2026-07-17
**Type:** Design spec (new structural adapter + app adoption)
**Status:** Proposed

---

## Goal

Let an app that already runs the full Agora auth stack (authkit + authz) get its agent
`Actor` **without hand-writing an `ActorResolver`**. Today `@adonis-agora/agent` ships only
`AuthActorResolver` (reads `ctx.auth.user`, a property) / `HeaderActorResolver` /
`UnconfiguredActorResolver`. AuthKit exposes `ctx.auth.getUser()` (async method) and keeps
roles out of the user object, so every AuthKit app writes a bespoke resolver — e.g.
entre-textos's `app/agent/actor_resolver.ts` (`AuthKitActorResolver`), which additionally
re-queries app-roles that nothing downstream reads.

Ship `authzActorResolver` in the existing `@adonis-agora/agent/authz` subpath so the app writes
one line and deletes its glue.

## Background — the three libs already share one seam: `@agora/context`

- **authkit** authenticates and, on identity resolution, writes a patch to the Agora context via
  the structural slot `Symbol.for('@agora/context:set')`:
  `{ userRef: { type: 'user', id: userId }, globalRoles, tenantId? }`
  (`authkit-client/src/observability/context_bridge.ts`, `populateContext`). It never imports
  `@adonis-agora/context`.
- **authz** reads that context structurally via `Symbol.for('@agora/context:accessor')`
  (`authz/core/src/agora/context.ts`, `readContextAccessor`): `userRef` and `tenantId` are direct
  accessor fields; `globalRoles` is read via the store `get()`. `AuthzService.effectiveRoles(user)`
  returns the union **globalRoles(context) ∪ resolveRoles(app) ∪ store(DB)**. It never imports
  authkit.
- **agent** is the only lib NOT plugged into that context. Its `ActorResolver.resolve(req)` reads
  `ctx.auth.user`. Closing this is the whole task: read the actor from the context authkit already
  populates, and take roles from authz.

### Why roles come from `authz.effectiveRoles` (decided)

In entre-textos `actor.roles` is consumed in exactly one place — `isAdmin` (governance routes +
dashboard), which checks the **global** `ADMIN`. Tool authorization already runs through
`authzToolAuthorizer` → `authz.can(actor, ability)`, which re-resolves roles inside authz. So the
app-roles the current resolver puts on the actor (`resolveAppRoles`) are dead weight.
`authz.effectiveRoles` is the single source that (a) already unions global + app + store, so it
covers both `isAdmin` and any app that uses the built-in `RolesPolicy`, and (b) reads `globalRoles`
from the same context, so `ADMIN` reaches `actor.roles` with no hand-merge.

---

## Global Constraints (ecosystem conventions — binding)

- **Structural, zero hard dep.** The adapter references `@adonis-agora/authz` and
  `@adonis-agora/context` **only by structure** (local interfaces + the well-known symbol slot),
  never by `import`. `@adonis-agora/authz` stays an OPTIONAL lazy peer; `@adonis-agora/context`
  is not a dependency at all. This mirrors the existing `authzToolAuthorizer` and authz's own
  `agora/context.ts`.
- **Load boundary.** The new code lives under the `./authz` subpath export only. The package main
  entry never references it, so apps that don't use authz never load it.
- **Fail-closed.** No authenticated identity in context → the resolver **throws**; the agent
  provider turns that into `401`. Identity is never fabricated (same posture as
  `UnconfiguredActorResolver`).
- **Opt-in factory.** Not a default. The app selects it explicitly:
  `actorResolver: authzActorResolver({ authz })`. The agent lib cannot assume authz is present.
- **Code + lib docs in English.** Product copy is not involved here.
- **The `Actor` contract is unchanged:** `{ id: string; roles?: string[]; tenantRef?: string }`.
  `actor.id` stays `app_users.id` (the owner ref / quota bucket / ownership key) — it must remain
  the context `userRef.id`, which authkit sets to the token `sub` = `app_users.id`.

---

## Component: `authzActorResolver`

**Location:** `packages/adonis/src/authz/` (the load-boundary module), exported from
`packages/adonis/src/authz/index.ts` (the `@adonis-agora/agent/authz` subpath).

### Structural context reader

A dependency-free reader mirroring `authz/core/src/agora/context.ts`, placed under the `authz`
subpath to preserve the load boundary. New file
`packages/adonis/src/authz/agora-context.ts`:

```ts
export const AGORA_CONTEXT_ACCESSOR = Symbol.for('@agora/context:accessor')

export interface AgoraContextAccessor {
  tenantId?: string
  userRef?: { type?: string; id?: string | number }
  get?: () => unknown
}

/** Read the active Agora context accessor from the global slot, if present. */
export function readContextAccessor(): AgoraContextAccessor | undefined {
  const slot = (globalThis as Record<symbol, unknown>)[AGORA_CONTEXT_ACCESSOR]
  if (slot == null || typeof slot !== 'object') return undefined
  return slot as AgoraContextAccessor
}
```

`userRef` and `tenantId` are direct accessor fields (authz's `tenantFromContext` reads
`accessor.tenantId` the same way), so the resolver does not need the store `get()` — it never reads
`globalRoles` itself (authz's `effectiveRoles` does that internally).

### Structural authz slice

The resolver needs only `effectiveRoles`. Add a dedicated structural interface next to the existing
`AuthzServiceLike` (do not overload the tool-authorizer's `can`-only interface):

```ts
export interface AuthzRolesSourceLike {
  /**
   * The user's effective roles — authz's union of global (context) ∪ app (resolveRoles) ∪
   * store (DB). Mirrors `AuthzService.effectiveRoles`.
   */
  effectiveRoles(user: unknown, scope?: AuthzTenantScope): Promise<string[]>
}
```

(`AuthzTenantScope` = `{ tenantId?: string }` is already defined in
`authz-tool-authorizer.ts`; reuse it.)

### Factory + resolver

New file `packages/adonis/src/authz/authz-actor-resolver.ts`:

```ts
import type { ActorResolver } from '../spi/actor-resolver.js'
import type { Actor } from '../types.js'
import { readContextAccessor } from './agora-context.js'
import type { AuthzTenantScope } from './authz-tool-authorizer.js'

export interface AuthzRolesSourceLike {
  effectiveRoles(user: unknown, scope?: AuthzTenantScope): Promise<string[]>
}

export interface AuthzActorResolverConfig {
  /** The `@adonis-agora/authz` `AuthzService` (or any structural match). */
  authz: AuthzRolesSourceLike
}

/**
 * An {@link ActorResolver} that reads the caller from the Agora context authkit populates
 * (`userRef`, `tenantId`) and takes the caller's roles from authz (`effectiveRoles`: the union
 * global ∪ app ∪ store). Framework-agnostic — it ignores `req` and reads the active Agora
 * context store, so it needs no `ctx.auth`.
 *
 * FAIL-CLOSED: no `userRef.id` in context → throws (the provider replies 401). Never fabricates
 * an identity.
 */
export class AuthzActorResolver implements ActorResolver {
  readonly #authz: AuthzRolesSourceLike
  constructor(config: AuthzActorResolverConfig) {
    this.#authz = config.authz
  }

  async resolve(_req: unknown): Promise<Actor> {
    const accessor = readContextAccessor()
    const ref = accessor?.userRef
    if (ref?.id === undefined || ref.id === null || String(ref.id).length === 0) {
      throw new Error(
        'authzActorResolver: no authenticated identity in @agora/context. The agent route must ' +
          'sit behind authkit auth middleware (which populates the context), with the context ' +
          'provider registered.',
      )
    }
    const scope: AuthzTenantScope | undefined = accessor?.tenantId
      ? { tenantId: accessor.tenantId }
      : undefined
    const roles = await this.#authz.effectiveRoles(ref, scope)
    return {
      id: String(ref.id),
      roles,
      ...(accessor?.tenantId ? { tenantRef: accessor.tenantId } : {}),
    }
  }
}

export function authzActorResolver(config: AuthzActorResolverConfig): ActorResolver {
  return new AuthzActorResolver(config)
}
```

Note the resolver passes the context `userRef` (`{ type, id }`) directly to `effectiveRoles`;
authz's `refOf` reads `.id`/`.type` from it, and `effectiveRoles` internally re-reads `globalRoles`
from the same context — so global roles (incl. `ADMIN`) land in the result with no extra wiring.

### Exports

`packages/adonis/src/authz/index.ts` adds:

```ts
export { AuthzActorResolver, authzActorResolver } from './authz-actor-resolver.js'
export type { AuthzActorResolverConfig, AuthzRolesSourceLike } from './authz-actor-resolver.js'
```

## Data flow

```
HTTP request → authkit auth middleware → getIdentity() success
   → context_bridge.populateContext(): @agora/context ← { userRef, globalRoles, tenantId }
agent route → provider #resolveActor → authzActorResolver.resolve(ctx)
   → readContextAccessor(): { userRef, tenantId }         (throws 401 if absent)
   → authz.effectiveRoles(userRef, { tenantId })
        = globalRoles(context) ∪ resolveRoles(app user_roles) ∪ store(authz_*)
   → Actor { id: userRef.id, roles, tenantRef: tenantId }
downstream: actor.id → ownership/quota/persistence; actor.roles → isAdmin gate +
   (for apps on the built-in RolesPolicy) tool intersection; actor.tenantRef → authz scope
```

## Error handling

- No context accessor slot, or `userRef.id` missing/empty → **throw** → provider `#resolveActor`
  catches → `401`. Covers: request not behind auth middleware, context provider not registered,
  unauthenticated caller.
- `authz.effectiveRoles` throws → propagates → `401` (fail-closed; the agent provider treats a
  resolver throw as unauthenticated). Acceptable: a broken authz wiring must not silently yield an
  actor with empty roles.

## Testing (lib)

New `packages/adonis/tests/authz/authz-actor-resolver.spec.ts`:

1. **Resolves from context + authz.** Seed the accessor slot with
   `{ userRef: { type: 'user', id: 'u-1' }, tenantId: 't-1' }`; stub
   `authz.effectiveRoles` to return `['COORDINATOR', 'ADMIN']`. Assert the resolver returns
   `{ id: 'u-1', roles: ['COORDINATOR', 'ADMIN'], tenantRef: 't-1' }` and that `effectiveRoles`
   was called with `({ type: 'user', id: 'u-1' }, { tenantId: 't-1' })`.
2. **No tenant → no tenantRef, scope undefined.** Accessor without `tenantId`; assert result has no
   `tenantRef` and `effectiveRoles` was called with `scope === undefined`.
3. **Fail-closed: no accessor slot → throws.** Delete the global slot; assert `resolve()` rejects.
4. **Fail-closed: accessor present but no `userRef.id` → throws.**
5. **Fail-closed: `effectiveRoles` rejects → `resolve()` rejects** (error propagates, no actor).
6. **`id` is stringified** when the context `userRef.id` is a number.

Tests set/delete `globalThis[Symbol.for('@agora/context:accessor')]` directly and restore it in
teardown — no real context lib needed (structural contract). Prove-by-mutation: each test must fail
against a resolver that reads the wrong slot / skips the guard.

Add a changeset (minor) for `@adonis-agora/agent`: "add `authzActorResolver` — resolve the agent
Actor from the Agora context (authkit) + authz effective roles".

---

## Adoption in entre-textos (phase 2, after the lib publishes)

1. **Bump** `@adonis-agora/agent` to the published minor.
2. **Delete** `app/agent/actor_resolver.ts` (`AuthKitActorResolver`) entirely.
3. **`config/agent.ts`:**
   - `import { authzActorResolver } from '@adonis-agora/agent/authz'`.
   - Replace `actorResolver: new AuthKitActorResolver()` with
     ```ts
     actorResolver: authzActorResolver({
       authz: { effectiveRoles: async (user, scope) =>
         (await app.container.make(AuthzService)).effectiveRoles(user, scope) },
     }),
     ```
     (same deferred-container idiom already used for `authzToolAuthorizer` in this file).
   - `isAdmin` and the `Actor` import stay unchanged.
4. **Keep** `app/agent/user_roles.ts` (`resolveAppRoles`) — it is still `config/authz.ts`'s
   `resolveRoles` seam. Only its use *inside the deleted actor resolver* goes away, ending the
   double resolution.
5. **Load-bearing check to prove in a test:** with a token carrying the global `ADMIN` claim,
   `actor.roles` (via `authz.effectiveRoles`) includes `ADMIN`, so `isAdmin` still gates governance
   + dashboard. This depends on authkit's context bridge writing `globalRoles` into context and
   authz reading it — the exact seam this design leans on. entre-textos already has
   `@adonis-agora/context` installed and `context_provider` registered.
6. **Test** (`tests/functional/agent/actor_resolver.spec.ts`, updated or replaced): populate the
   Agora context (or its accessor slot) with a `userRef` + `globalRoles: ['ADMIN']`, seed
   `user_roles` with `COORDINATOR`, resolve through the app's configured `actorResolver`, and assert
   `actor.id` = the user id and `actor.roles` ⊇ `{ COORDINATOR, ADMIN }`. Prove the ADMIN path by
   also asserting `isAdmin(actor)` is `true`, and `false` without the global claim.

---

## Risks

- **Context must be populated on the request path.** If the auth middleware / context provider are
  missing, the resolver fail-closes to 401 — correct, but a misconfig surfaces as "all agent
  requests 401". The thrown message names the cause (middleware + context provider). Mitigation:
  the adoption test exercises the populated path.
- **`effectiveRoles` cost.** One authz call per agent request (it already ran per tool check via
  `can`; this adds one union computation at resolve time). Negligible for entre-textos
  (`resolveRoles` is a single indexed `user_roles` query; the lucid store is idle). Not cached here
  — YAGNI.
- **Durable resume is unaffected.** The actor is resolved only on the request path (context live)
  and its `id` persists as `actorRef`; resume never re-resolves the actor. authz's own per-check
  role resolution on resume keeps using `resolveRoles` (DB), independent of this resolver.

## Non-goals

- Changing `@adonis-agora/authkit` or `@adonis-agora/authz` — both already expose exactly what is
  needed. No new hooks, no `superAdminRoles` migration (the app keeps its own `isAdmin`).
- Making `authzActorResolver` the agent's default — it stays opt-in (authz is an optional peer).
- A context-only resolver (id + `globalRoles`, no authz) — a plausible future sibling for apps
  without authz, but out of scope; the reusable `readContextAccessor` helper is placed so a later
  `contextActorResolver` could share it.
- Reading identity from `ctx.auth` — context is the chosen source; an authkit-`getUser()` adapter is
  not pursued.
- Multi-tenancy behavior changes — `tenantRef` is passed through as authz scope exactly as the
  existing tool-authorizer does; entre-textos runs single-tenant.

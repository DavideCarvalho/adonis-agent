# authzActorResolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `authzActorResolver` in `@adonis-agora/agent/authz` — an `ActorResolver` that reads the caller from the Agora context (populated by authkit) and takes roles from authz `effectiveRoles`, so authkit+authz apps stop hand-writing actor resolvers.

**Architecture:** A structural, zero-hard-dep adapter under the existing `./authz` load-boundary subpath. A tiny context reader mirrors authz's own `readContextAccessor` (reads the global symbol slot `Symbol.for('@agora/context:accessor')`). The resolver reads `userRef`/`tenantId` from that accessor, calls a structurally-typed `authz.effectiveRoles(userRef, scope)`, and returns `{ id, roles, tenantRef }`. Fail-closed: no identity in context → throws (provider → 401).

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), vitest (globals, `test/**/*.spec.ts`, swc), changesets.

## Global Constraints

- **Structural, zero hard dep.** Reference `@adonis-agora/authz` and `@adonis-agora/context` only by local interfaces + the well-known symbol slot. Never `import` either package. authz stays an OPTIONAL lazy peer; context is not a dependency.
- **Load boundary.** All new code lives under `src/authz/` and is reachable only via the `@adonis-agora/agent/authz` subpath. The package main entry never references it.
- **Fail-closed.** No `userRef.id` in context → throw. Never fabricate an identity.
- **Opt-in factory.** Not a default. App wires `actorResolver: authzActorResolver({ authz })`.
- **Code + docs in English.**
- **`Actor` contract unchanged:** `{ id: string; roles?: string[]; tenantRef?: string }`. `actor.id` = context `userRef.id` (stringified).
- **Symbol slot (exact):** `Symbol.for('@agora/context:accessor')`. Accessor fields consumed: `userRef?: { type?; id? }`, `tenantId?: string`.
- **Package name:** `@adonis-agora/agent`. Run a single test file with `pnpm exec vitest run test/<file>.spec.ts`. Typecheck with `pnpm run typecheck`.

---

### Task 1: Structural Agora-context reader

**Files:**
- Create: `packages/adonis/src/authz/agora-context.ts`
- Test: `packages/adonis/test/agora-context.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `AGORA_CONTEXT_ACCESSOR: unique symbol` = `Symbol.for('@agora/context:accessor')`
  - `interface AgoraContextAccessor { tenantId?: string; userRef?: { type?: string; id?: string | number }; get?: () => unknown }`
  - `function readContextAccessor(): AgoraContextAccessor | undefined`

- [ ] **Step 1: Write the failing test**

Create `packages/adonis/test/agora-context.spec.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { AGORA_CONTEXT_ACCESSOR, readContextAccessor } from '../src/authz/agora-context.js';

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[AGORA_CONTEXT_ACCESSOR];
});

describe('readContextAccessor', () => {
  it('returns undefined when the slot is absent', () => {
    expect(readContextAccessor()).toBeUndefined();
  });

  it('returns undefined when the slot is not an object', () => {
    (globalThis as Record<symbol, unknown>)[AGORA_CONTEXT_ACCESSOR] = 'nope';
    expect(readContextAccessor()).toBeUndefined();
  });

  it('returns the accessor object when present', () => {
    const accessor = { userRef: { type: 'user', id: 'u-1' }, tenantId: 't-1' };
    (globalThis as Record<symbol, unknown>)[AGORA_CONTEXT_ACCESSOR] = accessor;
    expect(readContextAccessor()).toBe(accessor);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/agora-context.spec.ts`
Expected: FAIL — cannot resolve `../src/authz/agora-context.js` (module does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `packages/adonis/src/authz/agora-context.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/agora-context.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/adonis/src/authz/agora-context.ts packages/adonis/test/agora-context.spec.ts
git commit -m "feat(agent): structural Agora-context reader for the authz subpath"
```

---

### Task 2: `authzActorResolver` factory + resolver

**Files:**
- Create: `packages/adonis/src/authz/authz-actor-resolver.ts`
- Modify: `packages/adonis/src/authz/index.ts` (add exports)
- Create: `.changeset/authz-actor-resolver.md` (repo root)
- Test: `packages/adonis/test/authz-actor-resolver.spec.ts`

**Interfaces:**
- Consumes:
  - `readContextAccessor()` from `./agora-context.js` (Task 1).
  - `AuthzTenantScope` (`{ tenantId?: string }`) from `./authz-tool-authorizer.js` (existing).
  - `ActorResolver` from `../spi/actor-resolver.js`, `Actor` from `../types.js` (existing).
- Produces:
  - `interface AuthzRolesSourceLike { effectiveRoles(user: unknown, scope?: AuthzTenantScope): Promise<string[]> }`
  - `interface AuthzActorResolverConfig { authz: AuthzRolesSourceLike }`
  - `class AuthzActorResolver implements ActorResolver`
  - `function authzActorResolver(config: AuthzActorResolverConfig): ActorResolver`

- [ ] **Step 1: Write the failing test**

Create `packages/adonis/test/authz-actor-resolver.spec.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import {
  authzActorResolver,
  type AuthzRolesSourceLike,
  type AuthzTenantScope,
} from '../src/authz/index.js';

const ACCESSOR = Symbol.for('@agora/context:accessor');

function setAccessor(value: unknown): void {
  (globalThis as Record<symbol, unknown>)[ACCESSOR] = value;
}

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[ACCESSOR];
});

/** Records the args it was called with; returns a fixed role set. */
class FakeAuthz implements AuthzRolesSourceLike {
  readonly calls: Array<{ user: unknown; scope?: AuthzTenantScope }> = [];
  constructor(private readonly roles: string[]) {}
  async effectiveRoles(user: unknown, scope?: AuthzTenantScope): Promise<string[]> {
    this.calls.push({ user, scope });
    return this.roles;
  }
}

describe('authzActorResolver', () => {
  it('resolves id + roles (from authz) + tenantRef from context', async () => {
    setAccessor({ userRef: { type: 'user', id: 'u-1' }, tenantId: 't-1' });
    const authz = new FakeAuthz(['COORDINATOR', 'ADMIN']);

    const actor = await authzActorResolver({ authz }).resolve({});

    expect(actor).toEqual({ id: 'u-1', roles: ['COORDINATOR', 'ADMIN'], tenantRef: 't-1' });
    expect(authz.calls).toEqual([
      { user: { type: 'user', id: 'u-1' }, scope: { tenantId: 't-1' } },
    ]);
  });

  it('omits tenantRef and passes an undefined scope when context has no tenant', async () => {
    setAccessor({ userRef: { type: 'user', id: 'u-2' } });
    const authz = new FakeAuthz([]);

    const actor = await authzActorResolver({ authz }).resolve({});

    expect(actor).toEqual({ id: 'u-2', roles: [] });
    expect('tenantRef' in actor).toBe(false);
    expect(authz.calls[0]?.scope).toBeUndefined();
  });

  it('fails closed when the context accessor slot is absent', async () => {
    const authz = new FakeAuthz(['ADMIN']);
    await expect(authzActorResolver({ authz }).resolve({})).rejects.toThrow(
      /no authenticated identity/i,
    );
  });

  it('fails closed when the accessor has no userRef id', async () => {
    setAccessor({ userRef: { type: 'user' }, tenantId: 't-1' });
    const authz = new FakeAuthz(['ADMIN']);
    await expect(authzActorResolver({ authz }).resolve({})).rejects.toThrow(
      /no authenticated identity/i,
    );
  });

  it('propagates an authz error without fabricating an actor', async () => {
    setAccessor({ userRef: { type: 'user', id: 'u-3' } });
    const authz: AuthzRolesSourceLike = {
      effectiveRoles: async () => {
        throw new Error('authz down');
      },
    };
    await expect(authzActorResolver({ authz }).resolve({})).rejects.toThrow('authz down');
  });

  it('stringifies a numeric context id', async () => {
    setAccessor({ userRef: { type: 'user', id: 42 } });
    const authz = new FakeAuthz(['ADMIN']);

    const actor = await authzActorResolver({ authz }).resolve({});

    expect(actor.id).toBe('42');
    expect(typeof actor.id).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/authz-actor-resolver.spec.ts`
Expected: FAIL — `authzActorResolver` / `AuthzRolesSourceLike` are not exported from `../src/authz/index.js`.

- [ ] **Step 3: Write the resolver**

Create `packages/adonis/src/authz/authz-actor-resolver.ts`:

```ts
import type { ActorResolver } from '../spi/actor-resolver.js';
import type { Actor } from '../types.js';
import { readContextAccessor } from './agora-context.js';
import type { AuthzTenantScope } from './authz-tool-authorizer.js';

/**
 * The structural slice of `@adonis-agora/authz`'s `AuthzService` this resolver needs: the user's
 * effective roles (authz's union of global (context) ∪ app (`resolveRoles`) ∪ store (DB)). Typed
 * structurally so `@adonis-agora/authz` stays an OPTIONAL lazy peer — zero import of the package.
 */
export interface AuthzRolesSourceLike {
  effectiveRoles(user: unknown, scope?: AuthzTenantScope): Promise<string[]>;
}

/** Options for {@link AuthzActorResolver} / {@link authzActorResolver}. */
export interface AuthzActorResolverConfig {
  /** The `@adonis-agora/authz` `AuthzService` (or any structural match) the resolver reads roles from. */
  authz: AuthzRolesSourceLike;
}

/**
 * An {@link ActorResolver} that reads the caller from the Agora context authkit populates
 * (`userRef`, `tenantId`) and takes the caller's roles from authz (`effectiveRoles`). It ignores
 * the transport `req` and reads the active Agora context store, so it needs no `ctx.auth` and is
 * framework-agnostic.
 *
 * Security posture — FAIL-CLOSED: no `userRef.id` in context → throws (the provider replies 401).
 * An identity is never fabricated. The context `userRef` is passed straight to `effectiveRoles`;
 * authz reads its `.id`/`.type` and re-reads `globalRoles` from the same context, so global roles
 * (e.g. `ADMIN`) land in the result with no extra wiring.
 */
export class AuthzActorResolver implements ActorResolver {
  readonly #authz: AuthzRolesSourceLike;

  constructor(config: AuthzActorResolverConfig) {
    this.#authz = config.authz;
  }

  async resolve(_req: unknown): Promise<Actor> {
    const accessor = readContextAccessor();
    const ref = accessor?.userRef;
    if (ref?.id === undefined || ref.id === null || String(ref.id).length === 0) {
      throw new Error(
        'authzActorResolver: no authenticated identity in @agora/context. The agent route must ' +
          'sit behind authkit auth middleware (which populates the context), with the ' +
          '@adonis-agora/context provider registered.',
      );
    }

    const scope: AuthzTenantScope | undefined = accessor?.tenantId
      ? { tenantId: accessor.tenantId }
      : undefined;
    const roles = await this.#authz.effectiveRoles(ref, scope);

    return {
      id: String(ref.id),
      roles,
      ...(accessor?.tenantId ? { tenantRef: accessor.tenantId } : {}),
    };
  }
}

/** Factory for {@link AuthzActorResolver}. */
export function authzActorResolver(config: AuthzActorResolverConfig): ActorResolver {
  return new AuthzActorResolver(config);
}
```

- [ ] **Step 4: Add exports**

Modify `packages/adonis/src/authz/index.ts` — append after the existing exports:

```ts
export { AuthzActorResolver, authzActorResolver } from './authz-actor-resolver.js';
export type { AuthzActorResolverConfig, AuthzRolesSourceLike } from './authz-actor-resolver.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run test/authz-actor-resolver.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Typecheck + full test suite (no regression)**

Run: `pnpm run typecheck && pnpm test`
Expected: typecheck clean; full vitest suite green (existing tests + the 3 + 6 new).

- [ ] **Step 7: Add changeset**

Create `.changeset/authz-actor-resolver.md` (at the repo root `/home/dudousxd/personal/oss/adonis/adonis-agent/.changeset/`):

```markdown
---
'@adonis-agora/agent': minor
---

Add `authzActorResolver` (exported from `@adonis-agora/agent/authz`) — resolve the agent `Actor` from the Agora context populated by authkit (`userRef`, `tenantId`) plus authz `effectiveRoles` (the union global ∪ app ∪ store). Structural, zero hard dependency; authkit+authz apps can drop hand-written actor resolvers. Fail-closed: no identity in context → 401.
```

- [ ] **Step 8: Commit**

```bash
git add packages/adonis/src/authz/authz-actor-resolver.ts packages/adonis/src/authz/index.ts packages/adonis/test/authz-actor-resolver.spec.ts .changeset/authz-actor-resolver.md
git commit -m "feat(agent): add authzActorResolver (actor from @agora/context + authz effectiveRoles)"
```

---

## Follow-up (NOT part of this plan — after the lib publishes)

entre-textos adoption (spec §"Adoption in entre-textos"): bump `@adonis-agora/agent`, delete `app/agent/actor_resolver.ts`, wire `actorResolver: authzActorResolver({ authz: { effectiveRoles: async (u, s) => (await app.container.make(AuthzService)).effectiveRoles(u, s) } })`, keep `isAdmin` + `resolveAppRoles` (still authz's `resolveRoles` seam), and add a test proving the global `ADMIN` claim flows context→authz→`actor.roles`. Tracked in the design spec; done in a separate app-side change.
```

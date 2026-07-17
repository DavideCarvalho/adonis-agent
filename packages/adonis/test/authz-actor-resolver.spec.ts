import { afterEach, describe, expect, it } from 'vitest';
import {
  type AuthzRolesSourceLike,
  type AuthzTenantScope,
  authzActorResolver,
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

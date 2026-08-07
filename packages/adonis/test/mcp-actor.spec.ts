import { describe, expect, it } from 'vitest';
import { actorFromAuthInfo, isActor } from '../src/mcp/actor.js';
import type { McpAuthInfo } from '../src/mcp/auth.js';

const baseAuthInfo = { token: 't', clientId: 'c', scopes: [] };

describe('isActor', () => {
  it('accepts a minimal actor with only an id', () => {
    expect(isActor({ id: 'u1' })).toBe(true);
  });

  it('accepts an actor with a roles array and tenant', () => {
    expect(isActor({ id: 'u1', roles: ['ADMIN', 'USER'], tenantRef: 'acme' })).toBe(true);
  });

  it('rejects non-object values', () => {
    for (const value of [null, undefined, 'u1', 42, true, ['u1']]) {
      expect(isActor(value)).toBe(false);
    }
  });

  it('rejects a missing or non-string id', () => {
    expect(isActor({})).toBe(false);
    expect(isActor({ id: 42 })).toBe(false);
  });

  it('rejects a non-array roles field', () => {
    expect(isActor({ id: 'u1', roles: 'ADMIN' })).toBe(false);
  });

  it('rejects a roles array containing non-strings', () => {
    expect(isActor({ id: 'u1', roles: ['ADMIN', 42] })).toBe(false);
  });
});

describe('actorFromAuthInfo', () => {
  it('reads the typed actor from extra', () => {
    const authInfo: McpAuthInfo = { ...baseAuthInfo, extra: { actor: { id: 'u1' } } };
    expect(actorFromAuthInfo(authInfo)).toEqual({ id: 'u1' });
  });

  it('throws when authInfo is absent', () => {
    expect(() => actorFromAuthInfo(undefined)).toThrow(/no actor/);
  });

  it('throws when extra.actor is missing or malformed', () => {
    expect(() => actorFromAuthInfo(baseAuthInfo)).toThrow(/no actor/);
    expect(() => actorFromAuthInfo({ ...baseAuthInfo, extra: {} })).toThrow(/no actor/);
    expect(() => actorFromAuthInfo({ ...baseAuthInfo, extra: { actor: { id: 42 } } })).toThrow(
      /no actor/,
    );
  });
});

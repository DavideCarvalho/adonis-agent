import { describe, expect, it } from 'vitest';
import { evaluateOwnership } from '../src/ownership.js';

describe('evaluateOwnership', () => {
  it('allows the owner (ownerRef === actorId)', () => {
    expect(evaluateOwnership('alice', 'alice', false)).toEqual({ ok: true, status: 200 });
  });

  it('denies a non-owner, non-privileged actor with 403', () => {
    expect(evaluateOwnership('bob', 'alice', false)).toEqual({
      ok: false,
      status: 403,
      error: 'forbidden',
    });
  });

  it('allows a non-owner when privileged (admin cross-actor)', () => {
    expect(evaluateOwnership('bob', 'alice', true)).toEqual({ ok: true, status: 200 });
  });

  it('returns 404 for an unknown resource (ownerRef null), even when privileged', () => {
    expect(evaluateOwnership('alice', null, false)).toEqual({
      ok: false,
      status: 404,
      error: 'not found',
    });
    // 404 wins over the privileged allow — a privileged caller still gets "not found", never a 200.
    expect(evaluateOwnership('alice', null, true)).toEqual({
      ok: false,
      status: 404,
      error: 'not found',
    });
  });

  it('does not treat a privileged flag as ownership when the actor genuinely owns it', () => {
    // Owner path returns ok regardless of privilege — no dependence on the privileged flag.
    expect(evaluateOwnership('alice', 'alice', true).ok).toBe(true);
  });
});

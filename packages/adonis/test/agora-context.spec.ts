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

import { describe, expect, it } from 'vitest';
import { deriveApiBase, resolveApiBase } from './api-base.js';

describe('deriveApiBase', () => {
  it('drops the trailing /dashboard mount segment', () => {
    expect(deriveApiBase('/agent/dashboard')).toBe('/agent');
    expect(deriveApiBase('/agent/dashboard/')).toBe('/agent');
    expect(deriveApiBase('/api/agent/dashboard')).toBe('/api/agent');
  });
  it('handles a root-mounted dashboard', () => {
    expect(deriveApiBase('/dashboard')).toBe('/');
  });
  it('best-effort cleans a non-dashboard path', () => {
    expect(deriveApiBase('/agent/')).toBe('/agent');
  });
});

describe('resolveApiBase', () => {
  it('prefers the injected base', () => {
    const win = {
      location: { pathname: '/agent/dashboard' },
      __AGENT_DASHBOARD_BASE__: '/custom/agent/',
    } as unknown as Window;
    expect(resolveApiBase(win)).toBe('/custom/agent');
  });
  it('falls back to the location-derived base', () => {
    const win = { location: { pathname: '/agent/dashboard' } } as unknown as Window;
    expect(resolveApiBase(win)).toBe('/agent');
  });
});

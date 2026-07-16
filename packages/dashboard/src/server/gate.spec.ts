import type { ActorResolver } from '@adonis-agora/agent';
import type { HttpContext } from '@adonisjs/core/http';
import { describe, expect, it } from 'vitest';
import { resolveDashboardConfig } from './define_config.js';
import { evaluateDashboardGate } from './gate.js';

const ctx = {} as HttpContext;
const resolverFor = (actor: { id: string; roles?: string[] }): ActorResolver => ({
  resolve: async () => actor,
});
const admin = { id: 'u1', roles: ['ADMIN'] };
const coordinator = { id: 'u2', roles: ['COORDINATOR'] };

describe('evaluateDashboardGate', () => {
  it('denies with 401 when no actor resolver is configured', async () => {
    expect(await evaluateDashboardGate(ctx, undefined)).toEqual({
      ok: false,
      status: 401,
      error: 'no actor resolver configured',
    });
  });

  it('denies with 401 when the resolver throws (unauthenticated)', async () => {
    const resolver: ActorResolver = {
      resolve: async () => {
        throw new Error('no session');
      },
    };
    expect(await evaluateDashboardGate(ctx, resolver)).toEqual({
      ok: false,
      status: 401,
      error: 'no session',
    });
  });

  it('allows any resolved actor when no authorize gate is set (default)', async () => {
    expect(await evaluateDashboardGate(ctx, resolverFor(coordinator))).toEqual({ ok: true });
  });

  it('allows when authorize returns true', async () => {
    const verdict = await evaluateDashboardGate(
      ctx,
      resolverFor(admin),
      (actor) => actor.roles?.includes('ADMIN') ?? false,
    );
    expect(verdict).toEqual({ ok: true });
  });

  it('denies with 403 when authorize returns false for the resolved actor', async () => {
    const verdict = await evaluateDashboardGate(
      ctx,
      resolverFor(coordinator),
      (actor) => actor.roles?.includes('ADMIN') ?? false,
    );
    expect(verdict).toEqual({ ok: false, status: 403, error: 'forbidden' });
  });

  it('denies with 403 when authorize throws', async () => {
    const verdict = await evaluateDashboardGate(ctx, resolverFor(admin), () => {
      throw new Error('policy blew up');
    });
    expect(verdict).toEqual({ ok: false, status: 403, error: 'policy blew up' });
  });

  it('passes the RESOLVED actor to authorize (not the raw request)', async () => {
    let seen: unknown;
    await evaluateDashboardGate(ctx, resolverFor(admin), (actor) => {
      seen = actor;
      return true;
    });
    expect(seen).toEqual(admin);
  });
});

describe('resolveDashboardConfig — authorize passthrough', () => {
  it('defaults authorize to undefined (any resolved actor allowed)', () => {
    expect(resolveDashboardConfig({}).authorize).toBeUndefined();
    expect(resolveDashboardConfig(undefined).enabled).toBe(true);
  });

  it('passes an authorize gate through untouched', () => {
    const authorize = () => true;
    expect(resolveDashboardConfig({ authorize }).authorize).toBe(authorize);
  });
});

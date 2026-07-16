import type { Database } from '@adonisjs/lucid/database';
import { afterEach, describe, expect, it } from 'vitest';
import type { Actor } from '../src/index.js';
import type { StoreContext } from '../src/stores/factory.js';
import { governanceQueries, pricingStores, stores } from '../src/stores/factory.js';
import { makeMemoryDb } from './helpers/make-db.js';

const actor: Actor = { id: 'user-1', roles: ['ADMIN'] };

/**
 * A minimal StoreContext whose container resolves the `'lucid.db'` alias to `db` — mirroring how the
 * AdonisJS container resolves Lucid's Database during a provider's `boot()`, BEFORE
 * `@adonisjs/lucid/services/db`'s default export is assigned (it is set only inside `app.booted()`).
 *
 * `make` throws for any other key, so a regression to the old `services/db` default-export deref cannot
 * silently pass here: outside a booted app that default is `undefined`, and building a store on it
 * throws — which is exactly the whole-app boot crash this resolution path fixes.
 */
function ctxWithDb(db: Database, extra: Record<string, unknown> = {}): StoreContext {
  return {
    app: {
      container: {
        make: async (key: unknown) => {
          if (key === 'lucid.db') return db;
          throw new Error(`unexpected container binding requested: ${String(key)}`);
        },
      },
    },
    ...extra,
  } as unknown as StoreContext;
}

describe('lucid factories resolve the Database from the container (boot-safe)', () => {
  let db: Database;
  afterEach(async () => {
    await db?.manager.closeAll();
  });

  it('stores.lucid() builds a working store on the container-resolved db', async () => {
    db = makeMemoryDb();
    const store = await stores.lucid()(ctxWithDb(db));
    const thread = await store.createThread({ actor, persona: 'default', title: 'x' });
    expect(thread.id).toBeTruthy();
  });

  it('pricingStores.lucid() builds a working pricing store on the container-resolved db', async () => {
    db = makeMemoryDb();
    const pricing = await pricingStores.lucid()(ctxWithDb(db));
    await pricing.upsertModelPrice({
      modelId: 'gpt-4o-mini',
      inputPricePer1m: 3,
      outputPricePer1m: 15,
    });
    expect((await pricing.listCurrentPrices()).map((p) => p.modelId)).toEqual(['gpt-4o-mini']);
  });

  it('governanceQueries.lucid() builds a working read-model on the container-resolved db', async () => {
    db = makeMemoryDb();
    const gov = await governanceQueries.lucid()(ctxWithDb(db, { pricingStore: undefined }));
    expect(await gov.spendByModel({ fromDay: '2026-01-01', toDay: '2026-12-31' })).toEqual([]);
  });
});

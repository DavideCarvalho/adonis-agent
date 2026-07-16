---
'@adonis-agora/agent': minor
'@adonis-agora/agent-dashboard': patch
---

`pricingStore` and `governanceQueries` now default to mirroring the main `store`.

When `store` is a `stores.lucid()` store, the agent now defaults the pricing store and the governance read-model to a Lucid store on the **same connection** (tables auto-created) with no extra config — so cost tracking and the `/agent/governance/*` routes work out of the box. Previously both were opt-in and omitting them left cost `null` and the governance routes unmounted.

- Override by passing a factory/instance as before (e.g. a different connection, or `pricingStores.memory()` for tests).
- Set `pricingStore: false` / `governanceQueries: false` to disable (cost stays `null`; governance routes not mounted).
- When the main store is not Lucid, both stay off unless set explicitly.

Adds `lucidStoreConnection(factory)` to read a `stores.lucid()` factory's connection (used internally for the mirroring). The `@adonis-agora/agent` peer range on `@adonis-agora/agent-dashboard` widens to `^0.4.0`.

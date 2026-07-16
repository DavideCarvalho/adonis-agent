# @adonis-agora/agent-dashboard

## 0.3.1

### Patch Changes

- [#12](https://github.com/DavideCarvalho/adonis-agent/pull/12) [`4021b6b`](https://github.com/DavideCarvalho/adonis-agent/commit/4021b6b5355ec7679f44f035a2c1dfafeb3c5e61) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Fix the dashboard provider crashing every app boot (and a duplicate-route crash)

  Two bugs that made the provider unbootable in a real app — surfaced the first time
  it was registered in one (entre-textos):

  - **`router` was `undefined` at boot.** The provider imported `router` from
    `@adonisjs/core/services/router` and called `router.get(...)` in `boot()`. That
    service's default export is only assigned inside an `app.booted()` hook, which
    runs AFTER every provider's `boot()`, so it was still `undefined` — `router.get`
    threw `Cannot read properties of undefined (reading 'get')` and crashed the whole
    app. It now resolves the router from the container (`app.container.make('router')`),
    available during boot, mirroring how the agent provider registers its routes.

  - **Duplicate `GET <mount>` route.** The provider registered a bare-mount redirect
    (`<mount>` → `<mount>/`) plus the shell at `<mount>/`. The AdonisJS router
    normalizes trailing slashes, so both are the SAME pattern — the second
    registration threw `Duplicate route found`. The shell now serves at the bare
    `<mount>` (one route), and `sendIndex` injects a `<base href="<mount>/">` so the
    SPA's relative `./assets/*` URLs (Vite `base: './'`) still resolve against the
    mount directory regardless of the URL's trailing slash.

## 0.3.0

### Minor Changes

- [#10](https://github.com/DavideCarvalho/adonis-agent/pull/10) [`c2ddde3`](https://github.com/DavideCarvalho/adonis-agent/commit/c2ddde3d4fdb5f87f3c49984c5cbbe145fbd1038) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Add an optional `authorize` gate to the dashboard config

  The console serves the governance read-model, which spans EVERY actor's spend and
  usage — so authenticating the caller (the default gate, shared with
  `/agent/governance/*`) is often not enough; you want to restrict it to admins.

  `config('agent').dashboard.authorize` is an optional `(actor, ctx) => boolean |
Promise<boolean>` run after the actor resolves. Return `false` (or throw) to deny
  — the request gets `403`. Omit it to keep the previous behavior (any resolved
  actor allowed). Typical use: `authorize: (actor) => actor.roles?.includes('ADMIN')
?? false`. The gate decision lives in a router-free `evaluateDashboardGate` helper
  so it is unit tested directly.

## 0.2.2

### Patch Changes

- [#6](https://github.com/DavideCarvalho/adonis-agent/pull/6) [`363382b`](https://github.com/DavideCarvalho/adonis-agent/commit/363382b5bd182f8de6184cd1c509209113710111) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - `pricingStore` and `governanceQueries` now default to mirroring the main `store`.

  When `store` is a `stores.lucid()` store, the agent now defaults the pricing store and the governance read-model to a Lucid store on the **same connection** (tables auto-created) with no extra config — so cost tracking and the `/agent/governance/*` routes work out of the box. Previously both were opt-in and omitting them left cost `null` and the governance routes unmounted.

  - Override by passing a factory/instance as before (e.g. a different connection, or `pricingStores.memory()` for tests).
  - Set `pricingStore: false` / `governanceQueries: false` to disable (cost stays `null`; governance routes not mounted).
  - When the main store is not Lucid, both stay off unless set explicitly.

  Adds `lucidStoreConnection(factory)` to read a `stores.lucid()` factory's connection (used internally for the mirroring). The `@adonis-agora/agent` peer range on `@adonis-agora/agent-dashboard` widens to `^0.4.0`.

## 0.2.1

### Patch Changes

- [#2](https://github.com/DavideCarvalho/adonis-agent/pull/2) [`3ed796f`](https://github.com/DavideCarvalho/adonis-agent/commit/3ed796f5106416726526651088fb98c1d2495172) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - `autoCreateTables` now defaults to **`true`** for the Lucid stores — the agent lib manages its own
  schema by default, completing the ecosystem convention (mirrors `@adonis-agora/durable` and
  `@adonis-agora/authz`). On first use a store provisions the six shared agent tables with `CREATE
TABLE IF NOT EXISTS`; set `autoCreateTables: false` (on `stores.lucid`, `pricingStores.lucid`, or
  `governanceQueries.lucid`) to opt out and run the published migration instead.

  Crucially, provisioning is no longer the agent store's job alone: the **pricing store** and the
  **governance read-model** also auto-provision on first use, sharing one memoized `CREATE TABLE` pass
  per db client (new exported `ensureAgentTables`). This closes two real gaps — seeding model prices
  before the first agent run, and opening the governance dashboard on a fresh deploy — that the
  store-only auto-create left broken.

  The dashboard's peer range is bumped to `@adonis-agora/agent@^0.3.0`.

## 0.2.0

### Minor Changes

- [`f1fea00`](https://github.com/DavideCarvalho/adonis-agent/commit/f1fea00e165ef6d106fa67ed9ceda6e03ddbca3b) - Acompanha o `@adonis-agora/agent` 0.2.x (o peer passa de `^0.1.0` para `^0.2.0`).

  O dashboard em si não mudou. Ele sobe junto porque o peer aponta para uma faixa que o agent acabou
  de deixar: publicar só o agent deixaria `agent-dashboard@0.1.0` exigindo um agent `^0.1.0` que não
  é mais a versão corrente.

  O peer já vai fixado em `^0.2.0` neste commit de propósito. Se ele ficasse em `^0.1.0`, o agent
  subindo para 0.2.0 o deixaria fora de range, e o changesets responde a isso bumpando o dependente
  para **major** (1.0.0) — mesmo com este changeset pedindo minor, porque ele toma o máximo dos dois.
  Com o peer já dentro da faixa nova, a cascata não dispara.

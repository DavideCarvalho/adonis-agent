# @adonis-agora/agent-dashboard

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

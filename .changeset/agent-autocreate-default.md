---
'@adonis-agora/agent': minor
'@adonis-agora/agent-dashboard': patch
---

`autoCreateTables` now defaults to **`true`** for the Lucid stores — the agent lib manages its own
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

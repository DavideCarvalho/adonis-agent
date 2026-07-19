# @adonis-agora/agent

## 0.14.0

### Minor Changes

- Add `RetrieveOptions.minScore` — a relevance floor applied to vector-store retrieval (passages with `score < minScore` are dropped before the top-K cut), enabling strict-grounding RAG. Also add per-agent `AgentDefinition.actorResolver`, letting an individual agent resolve its request actor differently from the global `config.actorResolver` (the per-agent resolver is preferred when present, falling back to the global otherwise).

## 0.13.3

### Patch Changes

- [`22b207e`](https://github.com/DavideCarvalho/adonis-agent/commit/22b207ed263192e8a34922b08d04821f3fa61d8d) - Tool discovery no longer aborts the whole scan when one tool file fails to import.

  The `app/agent_tools` readdir scan imported each file with no per-file guard, so a single tool whose module throws at import time (e.g. a top-level `@adonisjs/*/services/*` singleton resolving `app` as `undefined` during boot) took down the entire scan and left the agent with ZERO tools — which surfaces as the model "narrating" tool calls as text (it was never given any tools) rather than any visible error. Each import is now wrapped: a failing file is logged loudly (`app.logger`, else `console.error`) and skipped, so the other tools still register and the failure is diagnosable.

## 0.13.2

### Patch Changes

- [`88f70d8`](https://github.com/DavideCarvalho/adonis-agent/commit/88f70d851070767a70b1b1c7278a1a1e01f578f2) - Fix `tokenSinks.redis()` crashing at boot with "Cannot read properties of undefined (reading 'booted')".

  The Redis sink factory built its client by importing `@adonisjs/redis/services/main`, whose module-level `app` is `undefined` when the sink is resolved during `AgentProvider.boot` — so the sink threw at boot and, under `durable: true`, the first frame write hung (runs stuck at step 0). The sink factory now receives the app context (like store/quota factories) and resolves Redis via `app.container.make('redis')` with the live application, so it builds correctly. `SinkFactory` / `TokenSinkFactory` now take a `{ app }` context argument (a no-arg factory stays assignable, so existing custom sink factories keep working).

## 0.13.1

### Patch Changes

- [`293843c`](https://github.com/DavideCarvalho/adonis-agent/commit/293843c7fc6082453b80ab4b5272ca3cd31da887) - Redis token-stream sink: expire a run's replay keys instead of leaking them.

  The framework never calls the sink's `close()`, so the Redis multi-replica sink's per-run `chunks`/`state` keys accumulated forever. They now get a TTL (default **1h**, sliding window refreshed on every write — so a long run stays alive and a crashed run that never `end`s still expires). Configurable via `tokenSinks.redis({ ttlSeconds })`; set `0` to keep the previous retain-forever behaviour. Adds an optional `expire(key, seconds)` to the `RedisStreamClient` interface (the `@adonisjs/redis` adapter implements it; a bring-your-own client that omits it keeps working, just without the TTL).

## 0.13.0

### Minor Changes

- [`b684986`](https://github.com/DavideCarvalho/adonis-agent/commit/b68498606a02e82dc92d01a7aa139eb6ba752bee) - Add a framework-agnostic browser client and a React hook for the chat SSE endpoints.

  Consuming the agent's SSE envelope (`POST /agent/chat` → `event: meta` / `data: {delta}` / `event: component` / `event: done`) and reconnecting a dropped stream used to be re-implemented by hand in every app. Two new entry points move that logic into the package, next to the server that emits the envelope:

  - **`@adonis-agora/agent/client`** — zero-dependency, isomorphic. `createAgentChatClient({ basePath, fetch, getHeaders, resume })` returns `send()` / `resume()` that post a turn, parse the envelope, capture the run id, and — when the connection drops before `done` — re-attach to `GET /agent/chat/:runId/stream` (which replays the whole stream from the start and follows live) with backoff, until the run finishes or the retry budget is exhausted. The run is durable and keeps executing server-side across the drop, so no tokens are lost. Also exports the parsing primitives (`parseSseEvent`, `decodeFrame`, `foldPart`, `readSseStream`) and `AgentChatDisconnectedError` (which carries the partial parts).
  - **`@adonis-agora/agent/react`** — `useAgentChat({ ...clientOptions, buildBody })` returning `{ messages, status, error, send, cancel }`, a thin state wrapper over the client. `react` is a new optional peer dependency.

## 0.12.0

### Minor Changes

- [`0998975`](https://github.com/DavideCarvalho/adonis-agent/commit/0998975ca76b88c84b5e428139af0f363f28abbb) - Generative UI: typed stream frames (`text`|`component`), `AiToolCtx.emitComponent`, and `event: component` in the SSE provider. Backward compatible for text-only consumers.

### Patch Changes

- [#29](https://github.com/DavideCarvalho/adonis-agent/pull/29) [`fd77544`](https://github.com/DavideCarvalho/adonis-agent/commit/fd77544040bdf8d95c532f3f70c6bd7673cec4ca) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Fix agent tool-loop dropping tool results. `mapMessages` in the AI SDK adapter skipped `toolResults` on `role: 'user'` messages (early `continue`), but `agent-loop` feeds tool output back as a synthetic `{ role: 'user', content: '', toolResults }` carrier — so the results were silently dropped and the follow-up model call threw `AI_MissingToolResultsError`. The user branch now emits the `tool` result message (via a shared `pushToolResults` helper) and skips the empty user turn so the tool result stays adjacent to the assistant tool-call. Multi-step tool-calling now completes for OpenAI-compatible providers.

## 0.11.0

### Minor Changes

- [#31](https://github.com/DavideCarvalho/adonis-agent/pull/31) [`315eb41`](https://github.com/DavideCarvalho/adonis-agent/commit/315eb41839bff2903e96481e7ca98881accdd8cd) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Tools de classe agora são instanciados pelo **container do Adonis**, então `@inject` no construtor funciona — o app deixa de fazer service-locator (`app.container.make(...)`) dentro do `execute()`.

  ```ts
  @inject()
  export default class ReatribuirPesquisa extends ActionTool<Input, Result> {
    constructor(private allocation: CoordinatorAllocationService) {
      super();
    }
    static tool = {
      name: "reatribuir_pesquisa",
      description: "…",
      input,
      ability,
    };
    async execute(input, ctx) {
      return this.allocation.reassign({
        ...input,
        coordinatorId: ctx.actor.id,
      });
    }
  }
  ```

  A resolução é **lazy** (no primeiro `execute`) e cacheada: a descoberta roda no `boot()` do provider, antes do app estar totalmente booted, então um `container.make()` eager poderia falhar resolvendo um peer service — o mesmo motivo pelo qual a store factory do Lucid resolve lazy. Tools sem dependências continuam funcionando iguais.

  `discoverTools`, `registerToolsFromBarrel` e `registerToolExport` aceitam um `app?: ApplicationService` opcional (o provider passa `this.app`); sem ele, o comportamento pré-DI (`new Ctor()`) é preservado. `registerToolExport` continua síncrono.

## 0.10.1

### Patch Changes

- [#29](https://github.com/DavideCarvalho/adonis-agent/pull/29) [`6f0465d`](https://github.com/DavideCarvalho/adonis-agent/commit/6f0465d0fcedd3f826687154f60317d180e56651) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Fix agent tool-loop dropping tool results. `mapMessages` in the AI SDK adapter skipped `toolResults` on `role: 'user'` messages (early `continue`), but `agent-loop` feeds tool output back as a synthetic `{ role: 'user', content: '', toolResults }` carrier — so the results were silently dropped and the follow-up model call threw `AI_MissingToolResultsError`. The user branch now emits the `tool` result message (via a shared `pushToolResults` helper) and skips the empty user turn so the tool result stays adjacent to the assistant tool-call. Multi-step tool-calling now completes for OpenAI-compatible providers.

## 0.10.0

### Minor Changes

- [#27](https://github.com/DavideCarvalho/adonis-agent/pull/27) [`426b504`](https://github.com/DavideCarvalho/adonis-agent/commit/426b5040203fae41bb6a6fcc79ac5dbc0e9bc0ad) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Novas bases kind-específicas `ReadTool` e `ActionTool` (além do `BaseTool`): fixam o `kind` no base, então a subclasse escreve `static tool = { name, description, input, ability }` **truly bare** — sem `satisfies AiToolOptions` e sem a anotação `: AiToolOptions`. Antes o `kind: 'read' | 'action'` do `BaseTool`/`AiToolOptions` forçava um dos dois (a estática herdada não dá contextual-typing, então o literal alargaria `kind` para `string`). A descoberta lê o `kind` da estática do base. Exporta também `BaseToolOptions` (= `Omit<AiToolOptions, 'kind'>`).

## 0.9.0

### Minor Changes

- [#25](https://github.com/DavideCarvalho/adonis-agent/pull/25) [`e726f1f`](https://github.com/DavideCarvalho/adonis-agent/commit/e726f1fdcc13e479ffc10c150dc4148bc18efdfb) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Novo `BaseTool` (classe base opcional para a forma de classe de um tool) — o análogo do `BaseWorkflow` do durable. Declarar `static tool = { … }` numa subclasse de `BaseTool` é type-checado pela estática herdada (`static tool?: AiToolOptions`), sem precisar de `satisfies AiToolOptions`. `ToolHandler<I, O = unknown>` e `defineTool<I, O>` passam a tipar o retorno do `execute` (antes `Promise<unknown>`), então o compilador confere o corpo contra o que o tool promete. Ambos non-breaking (defaults preservam o comportamento anterior).

## 0.8.0

### Minor Changes

- [#23](https://github.com/DavideCarvalho/adonis-agent/pull/23) [`19c9ffd`](https://github.com/DavideCarvalho/adonis-agent/commit/19c9ffd9c285c7cab4e487c8bda73f7ce668be9e) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Add `authzActorResolver` (exported from `@adonis-agora/agent/authz`) — resolve the agent `Actor` from the Agora context populated by authkit (`userRef`, `tenantId`) plus authz `effectiveRoles` (the union global ∪ app ∪ store). Structural, zero hard dependency; authkit+authz apps can drop hand-written actor resolvers. Fail-closed: no identity in context → 401.

## 0.7.1

### Patch Changes

- [#21](https://github.com/DavideCarvalho/adonis-agent/pull/21) [`d02b26b`](https://github.com/DavideCarvalho/adonis-agent/commit/d02b26bea2acd8d6f7daac166116a6813d321a02) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Internal: simplify `readAiToolMeta` metadata resolution

  Refactor the tool-metadata lookup so the two authoring mechanisms (`@AiTool`
  decorator and `static tool`) and the two subjects (the value, its constructor)
  are composed explicitly — `metaOn(target) ?? metaOn(ctor)` — instead of a flat
  four-way fallback chain. No behavior or API change; discovery of both forms is
  unchanged (mutation-proven).

## 0.7.0

### Minor Changes

- [#19](https://github.com/DavideCarvalho/adonis-agent/pull/19) [`c3d7b14`](https://github.com/DavideCarvalho/adonis-agent/commit/c3d7b140cdf32ef4324e18d84a13860ff0eb1a7c) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Add a decorator-free `static tool` authoring form for class tools

  A tool class can now declare its metadata with a `static tool = { name, kind, description, input, … }`
  config instead of the `@AiTool({ … })` decorator — the same shape, mirroring
  `@adonis-agora/durable`'s `static workflow`. Discovery, registration, and execution are identical;
  `readAiToolMeta` now reads the static config when no decorator is present.

  ```ts
  import type {
    AiToolCtx,
    AiToolOptions,
    ToolHandler,
  } from "@adonis-agora/agent";
  import { z } from "zod";

  export default class GetWeather implements ToolHandler<{ city: string }> {
    static tool = {
      name: "getWeather",
      kind: "read",
      description: "Get the weather",
      input: z.object({ city: z.string() }),
    } satisfies AiToolOptions;

    async execute(input: { city: string }, ctx: AiToolCtx) {
      return { tempC: 21 };
    }
  }
  ```

  The `@AiTool` decorator and the functional `defineTool(...)` forms are unchanged.

## 0.6.0

### Minor Changes

- [#17](https://github.com/DavideCarvalho/adonis-agent/pull/17) [`ea6122f`](https://github.com/DavideCarvalho/adonis-agent/commit/ea6122f468f5308d3506461fb2bd2d7fc3159ef5) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Owner-scope the per-actor run/thread routes (object-level authorization)

  Follows up `0.5.0` (which authenticated these routes) by adding the ownership check: authentication
  alone let any authenticated caller act on ANOTHER actor's run/thread by id. Now a caller may act only
  on runs/threads it OWNS, unless it is governance-privileged.

  - **Run routes** — `GET /agent/chat/:runId/stream`, `POST /agent/chat/:runId/cancel`,
    `POST /agent/tool-call/approve`, `POST /agent/tool-call/reject` — now assert the resolved actor owns
    the run (the run's `actor_ref`, recorded as the loop's first step). A non-owner gets `403`; an
    unknown run gets `404` (so an id the caller doesn't own is never confirmed).
  - **Thread routes** — `GET /agent/threads/:id`, `DELETE /agent/threads/:id`,
    `POST /agent/threads/:id/fork-from/:messageId`, and `POST /agent/chat` when it continues an existing
    thread (`body.threadId`) — now assert the actor owns the thread. The chat case is the important one:
    without it an authenticated caller could pass another actor's `threadId` to load that thread's full
    history into the model (and read it back over SSE) and append its own turn into the victim's thread.
  - **Cross-actor override.** A caller that passes `governanceAuthorize` (the app's "may act across
    actors" seam, typically an ADMIN check) may act on any run/thread. With no `governanceAuthorize`
    configured, ownership is strict — no cross-actor access.

  New `AgentStore` SPI methods back the checks: **`getRunActorRef(runId)`** and
  **`getThreadActorRef(threadId)`** (both return the owning `actor_ref` or `null`), implemented on the
  Lucid and in-memory stores. A custom `AgentStore` implementation must add them. Also exposes the
  router-free `evaluateOwnership` helper and the `OwnershipVerdict` type, and `AgentService.runOwner` /
  `AgentService.threadOwner` passthroughs.

## 0.5.0

### Minor Changes

- [#14](https://github.com/DavideCarvalho/adonis-agent/pull/14) [`5de6247`](https://github.com/DavideCarvalho/adonis-agent/commit/5de6247c95a1f92fc92ba89bd1eaa2e89d0ba4ba) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Authenticate the mutation/lifecycle routes and gate the cross-actor governance read-model

  Closes a privilege gap surfaced the first time the routes were mounted behind a real app's
  auth. Previously several `/agent/*` routes were reachable without resolving an actor, and the
  `/agent/governance/*` read-model was readable by any authenticated caller regardless of role.

  - **Every `/agent/*` route now resolves the actor (401 on failure).** `chat/:runId/stream`,
    `chat/:runId/cancel`, `tool-call/approve`, `tool-call/reject`, `threads/personas/catalog`,
    `threads/:id` (GET/DELETE), and `threads/:id/fork-from/:messageId` previously ran with no
    actor resolution — an anonymous same-origin request could re-attach a run's token stream,
    cancel a run, or deliver a HITL approve/reject decision. They now go through the same resolver
    (and 401) as `chat`/`threads`/`quota`. The stream route authenticates via the request's
    session/cookies, so an `EventSource` re-attach still works. Apps that configured an
    `actorResolver` (the norm) are unaffected on legitimate calls; an app with no resolver now
    correctly 401s these routes instead of serving them anonymously.

  - **New `governanceAuthorize?: (actor, ctx) => boolean | Promise<boolean>` config option.** When
    set, each `/agent/governance/*` route runs it after resolving the actor and replies `403` on
    deny (fail-closed if it throws) — so the platform-wide spend/usage/threads/approvals read-model
    can be restricted (typically ADMIN-only). Omitted, governance stays readable by any resolved
    actor (the historical behavior). Mirrors `@adonis-agora/agent-dashboard`'s `authorize` hook so
    the JSON routes and the console SPA can be gated with the same predicate. Exposed as
    `evaluateGovernanceGate` (a router-free, unit-tested helper) and the `AgentGovernanceAuthorize`
    / `GovernanceGateVerdict` types.

  - **New `GET /agent/approvals/mine` route.** Returns the calling actor's OWN pending HITL
    approvals (`pendingApprovals({ actor })`, filtered by the owning run's `actor_ref`). It is
    mounted with the governance read-model but is NOT behind `governanceAuthorize`, so a non-admin
    surface (e.g. a coordinator's chat) can poll its own suspended tool calls even while the
    cross-actor `governance/approvals/pending` inbox is ADMIN-only.

## 0.4.1

### Patch Changes

- [#8](https://github.com/DavideCarvalho/adonis-agent/pull/8) [`8763c29`](https://github.com/DavideCarvalho/adonis-agent/commit/8763c29c43c4f766bc3f80e25d6e19f4e0c8aa6e) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Fix `app/agent_tools` discovery registering nothing in a dev/TypeScript app

  The `app/agent_tools` scanner picked which module extension to import from
  `extname(import.meta.url)` — the extension of the SCANNER's own file. Since the
  package ships compiled (`.js`), that was always `.js`, so an app running from
  TypeScript source under a loader (`app/agent_tools/*.ts`, no build barrel wired)
  had its directory scanned for `.js` files, matched none, and registered zero
  tools — the agent silently ran with an empty `ToolRegistry`.

  The extension is now derived from what the scanned directory actually holds
  (`.ts` when it has any non-declaration `.ts` file, else `.js`). At runtime an app
  runs from EITHER its source or its build — never both in one directory — so this
  still guarantees a built `.js` and a dev `.ts` of the same module never
  double-register. `.d.ts` declarations are still skipped.

## 0.4.0

### Minor Changes

- [#6](https://github.com/DavideCarvalho/adonis-agent/pull/6) [`363382b`](https://github.com/DavideCarvalho/adonis-agent/commit/363382b5bd182f8de6184cd1c509209113710111) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - `pricingStore` and `governanceQueries` now default to mirroring the main `store`.

  When `store` is a `stores.lucid()` store, the agent now defaults the pricing store and the governance read-model to a Lucid store on the **same connection** (tables auto-created) with no extra config — so cost tracking and the `/agent/governance/*` routes work out of the box. Previously both were opt-in and omitting them left cost `null` and the governance routes unmounted.

  - Override by passing a factory/instance as before (e.g. a different connection, or `pricingStores.memory()` for tests).
  - Set `pricingStore: false` / `governanceQueries: false` to disable (cost stays `null`; governance routes not mounted).
  - When the main store is not Lucid, both stay off unless set explicitly.

  Adds `lucidStoreConnection(factory)` to read a `stores.lucid()` factory's connection (used internally for the mirroring). The `@adonis-agora/agent` peer range on `@adonis-agora/agent-dashboard` widens to `^0.4.0`.

## 0.3.1

### Patch Changes

- [#4](https://github.com/DavideCarvalho/adonis-agent/pull/4) [`487ad72`](https://github.com/DavideCarvalho/adonis-agent/commit/487ad7265d512ab27b67a5b25802591f8719923c) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Fix an app-boot crash when configuring the Lucid store, pricing store, or governance read-model via the factory helpers.

  `stores.lucid()`, `pricingStores.lucid()`, `governanceQueries.lucid()`, and the pgvector retriever resolved the Lucid `Database` from `@adonisjs/lucid/services/db`'s default export. AdonisJS assigns that default only inside `app.booted()` — after every provider's `boot()` — but the agent provider builds these stores eagerly during its own `boot()`, so the default was still `undefined` and `db.connection(...)` threw a `TypeError`, failing the whole app boot. They now resolve the `Database` from the container via the `'lucid.db'` alias (registered in the database provider's `register()`, so it is available during boot) — the same binding `services/db` itself resolves. No public API change.

## 0.3.0

### Minor Changes

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

- [`f1fea00`](https://github.com/DavideCarvalho/adonis-agent/commit/f1fea00e165ef6d106fa67ed9ceda6e03ddbca3b) - Suporta `@adonis-agora/durable` 0.8.x (o peer passa de `^0.7.0` para `^0.8.0`).

  O durable 0.8.0 removeu o decorator `@Workflow`, que o `AgentRunWorkflow` usava, em favor de
  `BaseWorkflow` + `static workflow = { name, version }`. Instalar agent 0.1.0 ao lado de durable
  0.8.0 derrubava o modo durable inteiro — `TypeError: (0 , Workflow) is not a function` ao carregar
  o módulo, com o provider caindo silenciosamente no runner inline. O `^0.7.0` barrava a combinação,
  então ninguém instalou os dois juntos; o preço era ficar preso ao durable 0.7.

  O `AgentRunWorkflow` agora estende `BaseWorkflow` e declara `static workflow`. O resto da
  integração (`WorkflowEngine.start/signal/cancel`, `registerWorkflowClass`, `WorkflowSuspended`,
  `ContinueAsNew`, `WorkflowCtx`) não mudou.

  O bug nasceu de um vão de teste: o `durable` não era devDependency, então o lockfile resolvia
  0.7.0 e a suíte exercitava o runner durable contra a versão antiga — verde e cega para o 0.8.0.
  Agora é devDependency em `^0.8.0`, e os testes rodam contra a mesma versão que o peer promete.

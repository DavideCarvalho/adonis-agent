import { pathToFileURL } from 'node:url';
import type { HttpContext } from '@adonisjs/core/http';
import type { ApplicationService } from '@adonisjs/core/types';
import {
  type ActorDirectory,
  type ActorResolver,
  type AgentConfig,
  AgentDepsFactory,
  type AgentGovernanceQueries,
  type AgentPricingStore,
  AgentRegistry,
  type AgentRunner,
  AgentService,
  type AgentStore,
  type AttachmentStagingStore,
  DefaultToolAuthorizer,
  InProcessTokenStreamSink,
  InlineAgentRunner,
  type MessageAttachment,
  type ModelProvider,
  type PageContext,
  type QuotaStore,
  type Retriever,
  type RolesPolicy,
  type TokenStreamSink,
  ToolRegistry,
  type ToolsBarrel,
  UnconfiguredActorResolver,
  discoverTools,
  governanceQueries as governanceQueriesFactories,
  lucidStoreConnection,
  pricingStores,
  registerDelegateTools,
  registerFunctionalTool,
  registerToolsFromBarrel,
} from '../src/index.js';

interface ChatBody {
  message: string;
  threadId?: string;
  agent?: string;
  persona?: string;
  pageContext?: PageContext;
  /** Already-staged attachments (from `POST /agent/attachments`) to send with this message. */
  attachments?: MessageAttachment[];
}

/** Default per-file size cap when `attachmentMaxBytes` is omitted (20 MiB). */
const DEFAULT_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Default allowlist: what multimodal model providers commonly accept as native image/file parts. */
const DEFAULT_ALLOWED_ATTACHMENT_CONTENT_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
];

/**
 * Wires `@adonis-agora/agent` into the AdonisJS application from `config/agent.ts`:
 *
 * - `register()` binds the shared `ToolRegistry` + `AgentRegistry` singletons.
 * - `boot()` discovers tools (the generated `hooks/tools` barrel first, then an `app/agent_tools`
 *   readdir fallback), registers config-level functional tools and synthesizes `agent`-kind delegate
 *   tools for `delegatesTo` edges, builds the runtime graph (store/sink/quota/authorizer/actor-resolver
 *   → deps factory → the inline runner → the `AgentService` facade), and mounts the eleven `/agent`
 *   routes under `config.path` — plus an optional twelfth `POST /agent/attachments` upload route when
 *   `attachmentStaging` is configured.
 *
 * The selected store (`lucid`/`memory`) is built lazily from the config so its peer (`@adonisjs/lucid`)
 * loads only when chosen. Agent lifecycle events are emitted structurally by core onto the
 * `agora:agent:*` diagnostics channel when `@adonis-agora/diagnostics` is installed — no bridge needed.
 */
export default class AgentProvider {
  #store: AgentStore | null = null;
  #sink: TokenStreamSink | null = null;
  #actorDirectory: ActorDirectory | null = null;

  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(ToolRegistry, () => new ToolRegistry());
    this.app.container.singleton(AgentRegistry, () => {
      const config = this.app.config.get<AgentConfig>('agent', {} as AgentConfig);
      const registry = new AgentRegistry();
      registry.register({
        name: config.defaultAgent?.name ?? 'default',
        ...config.defaultAgent,
      });
      for (const definition of config.agents ?? []) {
        registry.register(definition);
      }
      return registry;
    });
  }

  async boot() {
    const config = this.app.config.get<AgentConfig>('agent', {} as AgentConfig);
    const registry = await this.app.container.make(ToolRegistry);
    const agents = await this.app.container.make(AgentRegistry);
    const defaultRoles = config.defaultRoles ?? ['ADMIN'];

    // ── Tool discovery: generated barrel first, else the app/agent_tools readdir fallback ──
    const barrel = await this.#loadGeneratedToolsBarrel();
    if (barrel) {
      await registerToolsFromBarrel(registry, barrel, defaultRoles);
    } else {
      await discoverTools(registry, this.app.makePath('app/agent_tools'), defaultRoles);
    }
    // Config-level functional tools (defineTool), then synthesized delegate tools.
    for (const tool of config.tools ?? []) {
      registerFunctionalTool(registry, tool, defaultRoles);
    }
    registerDelegateTools(registry, agents);

    // ── Runtime graph ──
    const model = await this.#resolveModel(config);
    const store = await this.#resolveStore(config);
    const sink = await this.#resolveSink(config);
    // Quota is resolved after the store so a ledger-backed quota can read the store's usage ledger.
    const quota = await this.#resolveQuota(config, store);
    const pricingStore = await this.#resolvePricing(config);
    // Governance read-model is resolved after pricing so the Lucid read-model prices its rollups
    // against the same live prices the loop's cost fold uses.
    const governance = await this.#resolveGovernance(config, pricingStore);
    const retriever = await this.#resolveRetriever(config);
    const attachmentStaging = await this.#resolveAttachmentStaging(config);
    const authorizer = this.#resolveAuthorizer(config, defaultRoles);
    const actorResolver = config.actorResolver ?? new UnconfiguredActorResolver();
    // Read-side identity lookup for governance/dashboard surfaces (optional; renders raw refs if unset).
    const actorDirectory = await this.#resolveActorDirectory(config);
    this.#store = store;
    this.#sink = sink;
    this.#actorDirectory = actorDirectory;

    const factory = new AgentDepsFactory({
      model,
      store,
      sink,
      rolesPolicy: authorizer,
      registry,
      agents,
      defaultAgentName: config.defaultAgent?.name ?? 'default',
      ...(quota !== undefined ? { quota } : {}),
      ...(pricingStore !== undefined ? { pricingStore } : {}),
      ...(retriever !== undefined ? { retriever } : {}),
      ...(config.retrievalTopK !== undefined ? { retrievalTopK: config.retrievalTopK } : {}),
      ...(config.toolTransientRetry !== undefined
        ? { toolTransientRetry: config.toolTransientRetry }
        : {}),
    });
    // `durable: true` runs each turn as a replay-safe `@adonis-agora/durable` workflow; it degrades
    // gracefully to the in-process runner when the durable peer isn't installed/configured.
    const runner =
      config.durable === true
        ? ((await this.#resolveDurableRunner(factory, store)) ??
          new InlineAgentRunner(factory, store))
        : new InlineAgentRunner(factory, store);
    const service = new AgentService(runner, store, factory);
    this.app.container.bindValue(AgentService, service);

    await this.#registerRoutes(config, service, actorResolver, attachmentStaging, governance);
  }

  async shutdown() {
    // The Lucid store shares the app's `db` (it owns no connection to close); the in-process sink
    // holds only per-run buffers that GC with the provider. Drop refs so a hot reload starts clean.
    this.#store = null;
    this.#sink = null;
    this.#actorDirectory = null;
  }

  // ── resolution helpers ────────────────────────────────────────────────────

  async #resolveModel(config: AgentConfig): Promise<ModelProvider> {
    const model = config.model;
    if (typeof model === 'function') {
      return model();
    }
    return model;
  }

  async #resolveStore(config: AgentConfig): Promise<AgentStore> {
    const name = config.store;
    if (name && config.stores?.[name]) {
      return config.stores[name]({ app: this.app });
    }
    const { InMemoryAgentStore } = await import('../src/testing/in-memory-store.js');
    return new InMemoryAgentStore();
  }

  async #resolveSink(config: AgentConfig): Promise<TokenStreamSink> {
    const sink = config.sink;
    if (sink === undefined) return new InProcessTokenStreamSink();
    return typeof sink === 'function' ? sink() : sink;
  }

  /**
   * Build the read-side actor directory from config (an `ActorDirectoryFactory` thunk or a ready
   * instance). `undefined` → governance/dashboard surfaces render raw opaque `actorRef`s.
   */
  async #resolveActorDirectory(config: AgentConfig): Promise<ActorDirectory | null> {
    const directory = config.actorDirectory;
    if (directory === undefined) return null;
    return typeof directory === 'function' ? directory({ app: this.app }) : directory;
  }

  async #resolveQuota(config: AgentConfig, store: AgentStore): Promise<QuotaStore | undefined> {
    const quota = config.quota;
    if (quota === undefined) return undefined;
    return typeof quota === 'function' ? quota({ app: this.app, store }) : quota;
  }

  /**
   * The Lucid connection of the main store when it is a `stores.lucid()` store (`null` = the app's
   * default connection), or `undefined` when the main store isn't Lucid. Used to default the pricing
   * store and governance read-model to the same connection the agent already persists on.
   */
  #mainStoreLucidConnection(config: AgentConfig): string | null | undefined {
    const name = config.store;
    const factory = name ? config.stores?.[name] : undefined;
    return lucidStoreConnection(factory);
  }

  /**
   * Build the pricing store. `false` disables it (cost stays `null`). Omitted → mirror the main store:
   * a Lucid pricing store on the same connection when the main store is Lucid, otherwise off.
   */
  async #resolvePricing(config: AgentConfig): Promise<AgentPricingStore | undefined> {
    const pricingStore = config.pricingStore;
    if (pricingStore === false) return undefined;
    if (pricingStore === undefined) {
      const connection = this.#mainStoreLucidConnection(config);
      if (connection === undefined) return undefined;
      return pricingStores.lucid(connection === null ? {} : { connection })({ app: this.app });
    }
    return typeof pricingStore === 'function' ? pricingStore({ app: this.app }) : pricingStore;
  }

  /**
   * Build the governance read-model. `false` disables it (the `/agent/governance/*` routes aren't
   * mounted). Omitted → mirror the main store: a Lucid read-model on the same connection when the main
   * store is Lucid, otherwise off. The factory receives the already-resolved `pricingStore` so the
   * Lucid read-model prices its rollups against the loop's live prices.
   */
  async #resolveGovernance(
    config: AgentConfig,
    pricingStore: AgentPricingStore | undefined,
  ): Promise<AgentGovernanceQueries | undefined> {
    const governance = config.governanceQueries;
    if (governance === false) return undefined;
    const ctx = { app: this.app, ...(pricingStore !== undefined ? { pricingStore } : {}) };
    if (governance === undefined) {
      const connection = this.#mainStoreLucidConnection(config);
      if (connection === undefined) return undefined;
      return governanceQueriesFactories.lucid(connection === null ? {} : { connection })(ctx);
    }
    return typeof governance === 'function' ? governance(ctx) : governance;
  }

  /** Build the inject-mode retriever from config (a `RetrieverFactory` thunk or a ready instance). */
  async #resolveRetriever(config: AgentConfig): Promise<Retriever | undefined> {
    const retriever = config.retriever;
    if (retriever === undefined) return undefined;
    return typeof retriever === 'function' ? retriever({ app: this.app }) : retriever;
  }

  /**
   * Build the attachment-staging store from config (an `AttachmentStagingFactory` thunk or a ready
   * instance). `undefined` → no upload route is mounted (a client sends already-staged references).
   */
  async #resolveAttachmentStaging(
    config: AgentConfig,
  ): Promise<AttachmentStagingStore | undefined> {
    const staging = config.attachmentStaging;
    if (staging === undefined) return undefined;
    return typeof staging === 'function' ? staging({ app: this.app }) : staging;
  }

  #resolveAuthorizer(config: AgentConfig, defaultRoles: string[]): RolesPolicy {
    return config.authorizer ?? config.rolesPolicy ?? new DefaultToolAuthorizer(defaultRoles);
  }

  /**
   * Build the durable runner when `durable: true`, or `null` to fall back to inline. The optional
   * `@adonis-agora/durable` peer is imported lazily (so the agent package never hard-depends on it),
   * its {@link WorkflowEngine} resolved from the container (bound by the durable provider), the agent
   * workflow registered on it, and the module-level durable context wired. A missing peer, an
   * unresolvable engine, or any wiring error logs a warning and degrades to the in-process runner
   * rather than breaking boot.
   */
  async #resolveDurableRunner(
    factory: AgentDepsFactory,
    store: AgentStore,
  ): Promise<AgentRunner | null> {
    try {
      const durable = await import('@adonis-agora/durable');
      const engine = await this.app.container.make(durable.WorkflowEngine);
      const { DurableAgentRunner, registerAgentWorkflow, setDurableAgentContext } = await import(
        '../src/durable/index.js'
      );
      setDurableAgentContext({ factory, store });
      registerAgentWorkflow(engine);
      return new DurableAgentRunner(engine, store);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[@adonis-agora/agent] \`durable: true\` was requested but the durable runner could not be wired (${message}) — is \`@adonis-agora/durable\` installed and configured? Falling back to the in-process (inline) runner.`,
      );
      return null;
    }
  }

  /** Best-effort import of the build-time tools barrel; `null` when absent (fall back to the scan). */
  async #loadGeneratedToolsBarrel(): Promise<ToolsBarrel | null> {
    const path = this.app.makePath('.adonisjs/agent/tools.js');
    try {
      const mod = (await import(pathToFileURL(path).href)) as { tools?: ToolsBarrel };
      return mod.tools ?? null;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ERR_MODULE_NOT_FOUND' || code === 'ENOENT') return null;
      throw err;
    }
  }

  // ── routes ────────────────────────────────────────────────────────────────

  async #registerRoutes(
    config: AgentConfig,
    service: AgentService,
    actorResolver: ActorResolver,
    attachmentStaging: AttachmentStagingStore | undefined,
    governance: AgentGovernanceQueries | undefined,
  ): Promise<void> {
    const router = await this.app.container.make('router');
    const path = (config.path ?? 'agent').replace(/^\/+|\/+$/g, '');
    const p = (suffix: string) => `${path}/${suffix}`;

    // 1. POST /agent/chat — resolve actor, start the run, SSE-pipe the token stream.
    router.post(p('chat'), async (ctx: HttpContext) => {
      const actor = await this.#resolveActor(ctx, actorResolver);
      if (actor === null) return;
      const body = (ctx.request.body() ?? {}) as ChatBody;
      const { runId, threadId } = await service.chat({
        actor,
        message: body.message,
        ...(body.threadId !== undefined ? { threadId: body.threadId } : {}),
        ...(body.agent !== undefined ? { agentName: body.agent } : {}),
        ...(body.persona !== undefined ? { personaId: body.persona } : {}),
        ...(body.pageContext !== undefined ? { pageContext: body.pageContext } : {}),
        ...(body.attachments !== undefined ? { attachments: body.attachments } : {}),
      });
      await this.#pipe(ctx, service, runId, threadId);
    });

    // 2. GET /agent/chat/:runId/stream — re-attach SSE.
    router.get(p('chat/:runId/stream'), async (ctx: HttpContext) => {
      await this.#pipe(ctx, service, String(ctx.params.runId));
    });

    // 3. POST /agent/chat/:runId/cancel.
    router.post(p('chat/:runId/cancel'), async (ctx: HttpContext) => {
      await service.cancel(String(ctx.params.runId));
      return ctx.response.json({ aborted: true });
    });

    // 4. POST /agent/tool-call/approve.
    router.post(p('tool-call/approve'), async (ctx: HttpContext) => {
      const body = (ctx.request.body() ?? {}) as { runId: string; toolCallId: string };
      await service.approve(body.runId, body.toolCallId);
      return ctx.response.json({ ok: true });
    });

    // 5. POST /agent/tool-call/reject.
    router.post(p('tool-call/reject'), async (ctx: HttpContext) => {
      const body = (ctx.request.body() ?? {}) as {
        runId: string;
        toolCallId: string;
        reason?: string;
      };
      await service.reject(body.runId, body.toolCallId, body.reason);
      return ctx.response.json({ ok: true });
    });

    // 6. GET /agent/threads — the actor's threads.
    router.get(p('threads'), async (ctx: HttpContext) => {
      const actor = await this.#resolveActor(ctx, actorResolver);
      if (actor === null) return;
      return ctx.response.json(await service.listThreads(actor.id));
    });

    // 7. GET /agent/threads/personas/catalog (before :id so it isn't captured by the param).
    router.get(p('threads/personas/catalog'), async (ctx: HttpContext) => {
      return ctx.response.json(service.personaCatalog());
    });

    // 8. GET /agent/threads/:id — detail or null.
    router.get(p('threads/:id'), async (ctx: HttpContext) => {
      return ctx.response.json(await service.getThread(String(ctx.params.id)));
    });

    // 9. DELETE /agent/threads/:id.
    router.delete(p('threads/:id'), async (ctx: HttpContext) => {
      await service.deleteThread(String(ctx.params.id));
      return ctx.response.json({ ok: true });
    });

    // 10. POST /agent/threads/:id/fork-from/:messageId.
    router.post(p('threads/:id/fork-from/:messageId'), async (ctx: HttpContext) => {
      return ctx.response.json(
        await service.forkThread(String(ctx.params.id), String(ctx.params.messageId)),
      );
    });

    // 11. GET /agent/quota/today.
    router.get(p('quota/today'), async (ctx: HttpContext) => {
      const actor = await this.#resolveActor(ctx, actorResolver);
      if (actor === null) return;
      return ctx.response.json(await service.quotaToday(actor.id));
    });

    // 12. POST /agent/attachments — OPTIONAL. Mounted only when `attachmentStaging` is configured, so
    // an app without it never exposes an upload surface. Buffers the multipart `file` field, validates
    // it against the size cap + content-type allowlist, then stages it into a model-fetchable
    // MessageAttachment the client sends back on its next `chat` call. Mirrors the SSE routes' envelope
    // (JSON body, actor resolved via the shared resolver, precise HTTP status on rejection).
    if (attachmentStaging !== undefined) {
      const staging = attachmentStaging;
      const maxBytes = config.attachmentMaxBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES;
      const allowedContentTypes =
        config.attachmentAllowedContentTypes ?? DEFAULT_ALLOWED_ATTACHMENT_CONTENT_TYPES;
      router.post(p('attachments'), async (ctx: HttpContext) => {
        const actor = await this.#resolveActor(ctx, actorResolver);
        if (actor === null) return;
        const file = ctx.request.file('file');
        if (file === null || file.tmpPath === undefined) {
          return ctx.response.status(400).json({ error: 'multipart field "file" is required' });
        }
        const contentType =
          file.headers?.['content-type']?.split(';')[0]?.trim() ?? `${file.type}/${file.subtype}`;
        if (!allowedContentTypes.includes(contentType)) {
          return ctx.response.status(415).json({
            error: `content type "${contentType}" is not allowed (allowed: ${allowedContentTypes.join(', ')})`,
          });
        }
        const sizeBytes = file.size;
        if (sizeBytes > maxBytes) {
          return ctx.response
            .status(413)
            .json({ error: `file exceeds the ${maxBytes}-byte limit` });
        }
        const { readFile } = await import('node:fs/promises');
        const data = await readFile(file.tmpPath);
        const attachment = await staging.stage({
          data,
          filename: file.clientName,
          contentType,
          sizeBytes,
          actor,
        });
        return ctx.response.json(attachment);
      });
    }

    // ── OPTIONAL governance read routes. Mounted only when `governanceQueries` is configured, so an
    // app without it never exposes the cost/usage read-model. All read-only (GET) and authenticated
    // (actor resolved via the shared resolver — governance is cross-actor data). `from`/`to` are
    // inclusive UTC days (`YYYY-MM-DD`), defaulting to today; `limit` defaults to 50, clamped to 200
    // (mirroring the dashboard's own clamp).
    if (governance !== undefined) {
      const gov = governance;
      const g = (suffix: string) => p(`governance/${suffix}`);
      const range = (ctx: HttpContext) => {
        const today = new Date().toISOString().slice(0, 10);
        const from = ctx.request.input('from', today);
        const to = ctx.request.input('to', today);
        return { fromDay: String(from), toDay: String(to) };
      };
      const limitOf = (ctx: HttpContext) => {
        const raw = Number.parseInt(String(ctx.request.input('limit', '50')), 10);
        const value = Number.isFinite(raw) && raw > 0 ? raw : 50;
        return Math.min(value, 200);
      };

      // GET /agent/governance/spend/model — per-model token + cost rollup over the range.
      router.get(g('spend/model'), async (ctx: HttpContext) => {
        const actor = await this.#resolveActor(ctx, actorResolver);
        if (actor === null) return;
        return ctx.response.json(await gov.spendByModel(range(ctx)));
      });

      // GET /agent/governance/spend/actor — per-actor token + cost rollup over the range.
      router.get(g('spend/actor'), async (ctx: HttpContext) => {
        const actor = await this.#resolveActor(ctx, actorResolver);
        if (actor === null) return;
        return ctx.response.json(await gov.spendByActor(range(ctx)));
      });

      // GET /agent/governance/usage/trend — the daily token + cost trend over the range.
      router.get(g('usage/trend'), async (ctx: HttpContext) => {
        const actor = await this.#resolveActor(ctx, actorResolver);
        if (actor === null) return;
        return ctx.response.json(await gov.usageTrend(range(ctx)));
      });

      // GET /agent/governance/tool-calls/recent — newest-first recent tool-call activity feed.
      router.get(g('tool-calls/recent'), async (ctx: HttpContext) => {
        const actor = await this.#resolveActor(ctx, actorResolver);
        if (actor === null) return;
        return ctx.response.json(await gov.recentToolCalls(limitOf(ctx)));
      });

      // GET /agent/governance/threads/recent — newest-first recent thread activity feed.
      router.get(g('threads/recent'), async (ctx: HttpContext) => {
        const actor = await this.#resolveActor(ctx, actorResolver);
        if (actor === null) return;
        return ctx.response.json(await gov.recentThreads(limitOf(ctx)));
      });

      // ── Run lifecycle governance (the run tracking read-model). Same read-only + authenticated
      // envelope; the runs are cross-actor governance data.
      const optionalRange = (ctx: HttpContext) => {
        const from = ctx.request.input('from');
        const to = ctx.request.input('to');
        return {
          ...(from !== undefined ? { from: String(from) } : {}),
          ...(to !== undefined ? { to: String(to) } : {}),
        };
      };

      // GET /agent/governance/runs — filterable, cursor-paginated run list, newest-first.
      // Query: actor?, agent?, status?, from?, to?, cursor?, limit?
      router.get(g('runs'), async (ctx: HttpContext) => {
        const actor = await this.#resolveActor(ctx, actorResolver);
        if (actor === null) return;
        const filterActor = ctx.request.input('actor');
        const agent = ctx.request.input('agent');
        const status = ctx.request.input('status');
        const cursor = ctx.request.input('cursor');
        const { from, to } = optionalRange(ctx);
        return ctx.response.json(
          await gov.listRuns({
            limit: limitOf(ctx),
            ...(filterActor !== undefined ? { actor: String(filterActor) } : {}),
            ...(agent !== undefined ? { agent: String(agent) } : {}),
            ...(status !== undefined ? { status: String(status) as never } : {}),
            ...(cursor !== undefined ? { cursor: String(cursor) } : {}),
            ...(from !== undefined ? { from } : {}),
            ...(to !== undefined ? { to } : {}),
          }),
        );
      });

      // GET /agent/governance/runs/:id — one run's full trace (run + messages + tool calls +
      // approvals + usage), or null.
      router.get(g('runs/:id'), async (ctx: HttpContext) => {
        const actor = await this.#resolveActor(ctx, actorResolver);
        if (actor === null) return;
        return ctx.response.json(await gov.runDetail(String(ctx.params.id)));
      });

      // GET /agent/governance/approvals/pending — cross-thread HITL approvals inbox, oldest first.
      router.get(g('approvals/pending'), async (ctx: HttpContext) => {
        const actor = await this.#resolveActor(ctx, actorResolver);
        if (actor === null) return;
        const filterActor = ctx.request.input('actor');
        return ctx.response.json(
          await gov.pendingApprovals({
            limit: limitOf(ctx),
            ...(filterActor !== undefined ? { actor: String(filterActor) } : {}),
          }),
        );
      });

      // GET /agent/governance/tools/stats — per-tool call/failure/rejection/latency rollup.
      router.get(g('tools/stats'), async (ctx: HttpContext) => {
        const actor = await this.#resolveActor(ctx, actorResolver);
        if (actor === null) return;
        return ctx.response.json(await gov.perToolStats(optionalRange(ctx)));
      });

      // GET /agent/governance/reliability — success/failure/cancel rates + mean settled duration.
      router.get(g('reliability'), async (ctx: HttpContext) => {
        const actor = await this.#resolveActor(ctx, actorResolver);
        if (actor === null) return;
        return ctx.response.json(await gov.runReliability(optionalRange(ctx)));
      });
    }
  }

  /** Resolve the actor; on failure reply 401 and return `null` so the handler short-circuits. */
  async #resolveActor(ctx: HttpContext, actorResolver: ActorResolver) {
    try {
      return await actorResolver.resolve(ctx);
    } catch (error) {
      ctx.response
        .status(401)
        .json({ error: error instanceof Error ? error.message : 'unauthorized' });
      return null;
    }
  }

  /**
   * Pipe the run's live token stream to the client as SSE, reproducing the envelope byte-for-byte:
   * `event: meta` (runId/threadId) → `data: {"delta":...}` per chunk → `event: done`. Sets the
   * `X-Agent-Run-Id` / `X-Agent-Thread-Id` headers. Writes the raw Node response directly (Adonis has
   * no SSE helper) and ends only on stream completion — the sink closes on run finish, not on suspend.
   */
  async #pipe(
    ctx: HttpContext,
    service: AgentService,
    runId: string,
    threadId?: string,
  ): Promise<void> {
    const raw = ctx.response.response;
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Agent-Run-Id': runId,
      ...(threadId !== undefined ? { 'X-Agent-Thread-Id': threadId } : {}),
    };
    raw.writeHead(200, headers);
    raw.write(`event: meta\ndata: ${JSON.stringify({ runId, threadId })}\n\n`);
    const decoder = new TextDecoder();
    for await (const chunk of service.subscribe(runId)) {
      raw.write(`data: ${JSON.stringify({ delta: decoder.decode(chunk) })}\n\n`);
    }
    raw.write('event: done\ndata: {}\n\n');
    raw.end();
  }
}

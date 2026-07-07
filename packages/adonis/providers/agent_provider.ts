import { pathToFileURL } from 'node:url';
import type { HttpContext } from '@adonisjs/core/http';
import type { ApplicationService } from '@adonisjs/core/types';
import {
  type ActorResolver,
  type AgentConfig,
  AgentDepsFactory,
  AgentRegistry,
  AgentService,
  type AgentStore,
  DefaultToolAuthorizer,
  InProcessTokenStreamSink,
  InlineAgentRunner,
  type ModelProvider,
  type PageContext,
  type QuotaStore,
  type RolesPolicy,
  type TokenStreamSink,
  ToolRegistry,
  type ToolsBarrel,
  UnconfiguredActorResolver,
  discoverTools,
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
}

/**
 * Wires `@adonis-agora/agent` into the AdonisJS application from `config/agent.ts`:
 *
 * - `register()` binds the shared `ToolRegistry` + `AgentRegistry` singletons.
 * - `boot()` discovers tools (the generated `hooks/tools` barrel first, then an `app/agent_tools`
 *   readdir fallback), registers config-level functional tools and synthesizes `agent`-kind delegate
 *   tools for `delegatesTo` edges, builds the runtime graph (store/sink/quota/authorizer/actor-resolver
 *   → deps factory → the inline runner → the `AgentService` facade), and mounts the eleven `/agent`
 *   routes under `config.path`.
 *
 * The selected store (`lucid`/`memory`) is built lazily from the config so its peer (`@adonisjs/lucid`)
 * loads only when chosen. Agent lifecycle events are emitted structurally by core onto the
 * `agora:agent:*` diagnostics channel when `@adonis-agora/diagnostics` is installed — no bridge needed.
 */
export default class AgentProvider {
  #store: AgentStore | null = null;
  #sink: TokenStreamSink | null = null;

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
    const quota = await this.#resolveQuota(config);
    const authorizer = this.#resolveAuthorizer(config, defaultRoles);
    const actorResolver = config.actorResolver ?? new UnconfiguredActorResolver();
    this.#store = store;
    this.#sink = sink;

    if (config.durable === true) {
      console.warn(
        '[@adonis-agora/agent] `durable: true` is not yet supported (the durable runner is deferred) — ' +
          'falling back to the in-process (inline) runner.',
      );
    }

    const factory = new AgentDepsFactory({
      model,
      store,
      sink,
      rolesPolicy: authorizer,
      registry,
      agents,
      defaultAgentName: config.defaultAgent?.name ?? 'default',
      ...(quota !== undefined ? { quota } : {}),
    });
    const runner = new InlineAgentRunner(factory, store);
    const service = new AgentService(runner, store, factory);
    this.app.container.bindValue(AgentService, service);

    await this.#registerRoutes(config, service, actorResolver);
  }

  async shutdown() {
    // The Lucid store shares the app's `db` (it owns no connection to close); the in-process sink
    // holds only per-run buffers that GC with the provider. Drop refs so a hot reload starts clean.
    this.#store = null;
    this.#sink = null;
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

  async #resolveQuota(config: AgentConfig): Promise<QuotaStore | undefined> {
    const quota = config.quota;
    if (quota === undefined) return undefined;
    return typeof quota === 'function' ? quota() : quota;
  }

  #resolveAuthorizer(config: AgentConfig, defaultRoles: string[]): RolesPolicy {
    return config.authorizer ?? config.rolesPolicy ?? new DefaultToolAuthorizer(defaultRoles);
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

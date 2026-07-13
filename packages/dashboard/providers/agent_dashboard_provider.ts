import { readFile } from 'node:fs/promises';
import type { ActorResolver, AgentConfig } from '@adonis-agora/agent';
import type { HttpContext } from '@adonisjs/core/http';
import router from '@adonisjs/core/services/router';
import type { ApplicationService } from '@adonisjs/core/types';
import { type AgentDashboardConfig, resolveDashboardConfig } from '../src/server/define_config.js';
import {
  apiBaseFor,
  contentTypeFor,
  injectApiBase,
  mountPathFor,
  safeAssetSegments,
} from '../src/server/paths.js';

/**
 * Serves the `@adonis-agora/agent-dashboard` governance SPA (a Vite build in `dist/spa`) as static
 * assets under `<agentPath>/dashboard`, behind the SAME actor gating as the agent's governance
 * routes: every request resolves the actor through the agent config's `actorResolver`, replying `401`
 * on failure (an app that never configured a resolver exposes nothing — identical to the
 * `/agent/governance/*` routes). This is a thin, idiomatic AdonisJS static server — no NestJS module,
 * no bundled API. The SPA calls the agent's own real read routes.
 *
 * Routes (mount = `<agentPath>/dashboard`, default `/agent/dashboard`):
 * - `GET <mount>`      → `302` to `<mount>/` (canonical trailing slash so relative assets resolve)
 * - `GET <mount>/`     → the SPA shell (`index.html`, with the resolved API base injected)
 * - `GET <mount>/*`    → a built asset, or the SPA shell as a fallback (client-rendered console)
 *
 * Enable/disable and override the mount via the optional `config('agent').dashboard` block.
 */
export default class AgentDashboardProvider {
  constructor(protected app: ApplicationService) {}

  /** The built SPA directory (`dist/spa`) as a `file://` URL, next to this compiled provider. */
  private spaDirUrl = new URL('../spa/', import.meta.url);

  async boot() {
    const agentConfig = this.app.config.get<AgentConfig>('agent', {} as AgentConfig);
    const dashboardConfig = resolveDashboardConfig(
      this.app.config.get<AgentDashboardConfig>('agent.dashboard', {}),
    );
    if (!dashboardConfig.enabled) return;

    const agentPath = agentConfig.path ?? 'agent';
    const apiBase = apiBaseFor(agentPath);
    const mount = mountPathFor(agentPath, dashboardConfig.path);
    const actorResolver = agentConfig.actorResolver;

    // Bare mount → canonical trailing slash so the SPA's relative `./assets/*` URLs resolve against
    // the mount directory rather than its parent.
    router.get(mount, (ctx) => ctx.response.redirect().toPath(`${mount}/`));

    // The SPA shell.
    router.get(`${mount}/`, async (ctx) => {
      if (!(await this.gate(ctx, actorResolver))) return;
      await this.sendIndex(ctx, apiBase);
    });

    // Built assets (JS/CSS/fonts/...), with an index fallback for any unmatched path so the
    // client-rendered console still boots on a deep link.
    router.get(`${mount}/*`, async (ctx) => {
      if (!(await this.gate(ctx, actorResolver))) return;
      const segments = safeAssetSegments(ctx.params['*']);
      if (segments === null) {
        return ctx.response.status(400).json({ error: 'bad asset path' });
      }
      await this.sendAsset(ctx, segments, apiBase);
    });
  }

  /**
   * Resolve the actor through the agent config's resolver, mirroring the governance routes. Returns
   * `true` to proceed; on a missing/failed resolver replies `401` and returns `false`.
   */
  private async gate(ctx: HttpContext, actorResolver: ActorResolver | undefined): Promise<boolean> {
    if (actorResolver === undefined) {
      ctx.response.status(401).json({ error: 'no actor resolver configured' });
      return false;
    }
    try {
      await actorResolver.resolve(ctx);
      return true;
    } catch (error) {
      ctx.response
        .status(401)
        .json({ error: error instanceof Error ? error.message : 'unauthorized' });
      return false;
    }
  }

  /** Read `dist/spa/index.html`, inject the API base, and send it. */
  private async sendIndex(ctx: HttpContext, apiBase: string): Promise<void> {
    const html = await readFile(new URL('index.html', this.spaDirUrl), 'utf8');
    ctx.response.header('content-type', 'text/html; charset=utf-8');
    ctx.response.header('cache-control', 'no-store, must-revalidate');
    ctx.response.send(injectApiBase(html, apiBase));
  }

  /** Send the requested built asset, or fall back to the SPA shell when it does not exist. */
  private async sendAsset(ctx: HttpContext, segments: string[], apiBase: string): Promise<void> {
    const filename = segments[segments.length - 1] ?? 'index.html';
    try {
      const buffer = await readFile(new URL(segments.join('/'), this.spaDirUrl));
      ctx.response.header('content-type', contentTypeFor(filename));
      ctx.response.send(buffer);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.sendIndex(ctx, apiBase);
        return;
      }
      throw error;
    }
  }
}

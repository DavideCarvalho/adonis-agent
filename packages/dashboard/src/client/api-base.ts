/**
 * Resolve the base URL of the agent routes the SPA calls. The provider injects the exact base it
 * mounted the agent under as `window.__AGENT_DASHBOARD_BASE__` when it serves `index.html`; when that
 * is absent (e.g. the standalone `vite dev` preview) we derive it from the page's own location by
 * stripping the trailing `/dashboard` mount segment. Either way the SPA never hard-codes `/agent`.
 */

declare global {
  interface Window {
    __AGENT_DASHBOARD_BASE__?: string;
  }
}

/** Strip a trailing `/` (but never reduce `/` itself to `''`). */
function stripTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/**
 * Derive the agent API base from the dashboard's own `pathname`. The dashboard is mounted at
 * `<agentBase>/dashboard`, so we drop that last segment: `/agent/dashboard` → `/agent`,
 * `/api/agent/dashboard/` → `/api/agent`. A pathname that does not end in `/dashboard` is returned
 * cleaned (trailing slash removed) as a best-effort base.
 */
export function deriveApiBase(pathname: string): string {
  const clean = stripTrailingSlash(pathname);
  if (clean.endsWith('/dashboard')) {
    const base = clean.slice(0, -'/dashboard'.length);
    return base === '' ? '/' : base;
  }
  return clean === '' ? '/' : clean;
}

/** The resolved agent API base for this page (injected value wins, else location-derived). */
export function resolveApiBase(
  win: Pick<Window, 'location'> & { __AGENT_DASHBOARD_BASE__?: string } = window,
): string {
  const injected = win.__AGENT_DASHBOARD_BASE__;
  if (typeof injected === 'string' && injected !== '') return stripTrailingSlash(injected);
  return deriveApiBase(win.location.pathname);
}

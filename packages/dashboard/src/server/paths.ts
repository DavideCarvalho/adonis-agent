/**
 * Pure path/asset helpers for the dashboard provider — extracted so they can be unit-tested without
 * booting an AdonisJS app. The provider composes these; it holds only the router wiring + I/O.
 */

/** Collapse duplicate slashes and strip leading/trailing ones: `/agent//` → `agent`. */
export function trimSlashes(path: string): string {
  return path.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
}

/** The agent API base as an absolute path with a single leading slash: `agent` → `/agent`. */
export function apiBaseFor(agentPath: string): string {
  const trimmed = trimSlashes(agentPath);
  return trimmed === '' ? '/' : `/${trimmed}`;
}

/**
 * The canonical dashboard mount path (no trailing slash), default `<agentPath>/dashboard`. A caller
 * may override with an explicit `dashboardPath`; both are normalized to a single leading slash.
 */
export function mountPathFor(agentPath: string, dashboardPath?: string): string {
  if (dashboardPath !== undefined && trimSlashes(dashboardPath) !== '') {
    return `/${trimSlashes(dashboardPath)}`;
  }
  const trimmed = trimSlashes(agentPath);
  return trimmed === '' ? '/dashboard' : `/${trimmed}/dashboard`;
}

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
};

/** MIME type for a filename by extension; `application/octet-stream` for anything unknown. */
export function contentTypeFor(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const ext = dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Reject a wildcard asset request that tries to escape the SPA root via `..` or an absolute path.
 * Returns the safe, normalized relative segments (never starting with `..`), or `null` to deny.
 */
export function safeAssetSegments(wildcard: string | string[] | undefined): string[] | null {
  const parts = Array.isArray(wildcard) ? wildcard : (wildcard ?? '').split('/');
  const segments: string[] = [];
  for (const raw of parts) {
    const part = raw.trim();
    if (part === '' || part === '.') continue;
    if (part === '..' || part.includes('\0') || part.includes('\\')) return null;
    segments.push(part);
  }
  return segments;
}

/**
 * Inject the resolved agent API base into the served `index.html` as a global the SPA reads before
 * boot, so the client calls the exact base the provider mounted (no build-time coupling). Idempotent
 * per response — inserted right before `</head>`.
 */
export function injectApiBase(html: string, apiBase: string): string {
  const tag = `<script>window.__AGENT_DASHBOARD_BASE__=${JSON.stringify(apiBase)}</script>`;
  if (html.includes('</head>')) return html.replace('</head>', `${tag}</head>`);
  return `${tag}${html}`;
}

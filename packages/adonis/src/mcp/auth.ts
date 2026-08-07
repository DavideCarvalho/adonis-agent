import type { ApplicationService } from '@adonisjs/core/types';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Actor } from '../types.js';

/**
 * Runtime context a {@link McpAuthFactory} thunk receives when the MCP provider builds the configured
 * auth at boot. Carries the booted application so a driver can resolve a peer's service if it needs to.
 */
export interface McpAuthContext {
  app: ApplicationService;
}

/**
 * OAuth metadata the MCP server advertises at `/.well-known/oauth-protected-resource{path}` (RFC 9728)
 * so an MCP client can discover how to obtain a token. Omitted → the server exposes no OAuth metadata
 * endpoint and clients must authenticate another way (e.g. a static API key).
 */
export interface McpOAuthMetadata {
  /** The OAuth 2.0 / OIDC authorization server (the authkit issuer, e.g. `http://localhost:3333/oidc`). */
  issuer: string;
  /** Authorization endpoint the MCP client redirects to (e.g. `${issuer}/auth`). */
  authorizationEndpoint: string;
  /** Token endpoint the MCP client exchanges the code at (e.g. `${issuer}/token`). */
  tokenEndpoint: string;
  /** Scopes supported by the authorization server. */
  scopesSupported: string[];
  /** Human label for the protected resource. */
  resourceName: string;
}

/**
 * A configured MCP auth strategy. `verify` validates a bearer token and resolves the acting {@link Actor}
 * (attached to `AuthInfo.extra.actor`); it MUST throw when the token is missing/invalid/expired. The
 * same `AuthInfo` is surfaced to the `tools/list` / `tools/call` handlers as `extra.authInfo`, so the
 * actor the tool registry gates against is exactly the one the auth strategy resolved.
 */
export interface McpAuth {
  /** OAuth metadata to advertise, resolved lazily (the authkit peer may not be bootable until first use). */
  oauth?: McpOAuthMetadata | (() => McpOAuthMetadata | Promise<McpOAuthMetadata>);
  /** Validate `token` and resolve the acting actor. Throws `Error` on rejection. */
  verify(token: string): Promise<AuthInfo>;
}

/**
 * A configured MCP auth strategy, as a lazy thunk the provider calls at boot. Each factory lazily
 * imports / resolves its peer inside the thunk, so nothing loads until the strategy is actually selected.
 */
export type McpAuthFactory = (ctx: McpAuthContext) => McpAuth | Promise<McpAuth>;

/**
 * Resolve a `McpAuth` config value (a ready instance or a lazy factory) at provider boot.
 */
export async function resolveMcpAuth(
  auth: McpAuth | McpAuthFactory,
  ctx: McpAuthContext,
): Promise<McpAuth> {
  if (typeof auth === 'function') {
    return auth(ctx);
  }
  return auth;
}

// ── authKitAuth ─────────────────────────────────────────────────────────────

/** Shape of the authkit `OidcService` the MCP auth resolves from the container. Duck-typed. */
interface AuthKitServiceLike {
  config: { issuer: string };
  provider: {
    AccessToken: {
      find(token: string): Promise<AuthKitAccessTokenLike | undefined>;
    };
  };
}

/** Shape of an oidc-provider access token instance as returned by `AccessToken.find`. */
interface AuthKitAccessTokenLike {
  accountId: string;
  clientId?: string;
  scope?: string;
  exp?: number;
  isExpired: boolean;
}

/** How `authKitAuth()` maps an access token to the MCP actor. Defaults to the account id. */
export type AuthKitActorResolver = (info: {
  accountId: string;
  scopes: string[];
  clientId: string | undefined;
}) => Actor | Promise<Actor>;

/** Options for {@link authKitAuth}. */
export interface AuthKitMcpAuthOptions {
  /** Scopes the authorization server advertises. Defaults to the standard authkit scopes. */
  scopes?: string[];
  /** Map a validated access token to the acting {@link Actor}. Defaults to `{ id: accountId }`. */
  toActor?: AuthKitActorResolver;
  /** Human label for the protected resource. Defaults to `'Agent MCP Server'`. */
  resourceName?: string;
}

/**
 * Authenticate MCP clients with `@adonis-agora/authkit-server`: verifies the bearer token against the
 * authkit OIDC provider's stored access tokens (`provider.AccessToken.find`) and advertises OAuth
 * metadata derived from the issuer so MCP clients can run the full OAuth login flow.
 *
 * The authkit peer is resolved lazily — the `verify`/`oauth` accessors touch the container only when
 * a request actually arrives (by then the app is fully booted and the authkit keystore/encryption
 * services are ready). `@adonis-agora/authkit-server` stays an optional dependency. Throws a clear
 * error at first use if the binding isn't resolvable (authkit not installed / provider not registered).
 */
export function authKitAuth(options: AuthKitMcpAuthOptions = {}): McpAuthFactory {
  const scopes = options.scopes ?? ['openid', 'profile', 'email', 'offline_access', 'roles'];
  const toActor: AuthKitActorResolver = options.toActor ?? (({ accountId }) => ({ id: accountId }));

  return async ({ app }) => {
    let servicePromise: Promise<AuthKitServiceLike> | undefined;

    const getService = (): Promise<AuthKitServiceLike> => {
      servicePromise ??= resolveAuthKitService(app);
      return servicePromise;
    };

    const oauth = async (): Promise<McpOAuthMetadata> => {
      const service = await getService();
      const issuer = service.config.issuer;
      return {
        issuer,
        authorizationEndpoint: `${issuer}/auth`,
        tokenEndpoint: `${issuer}/token`,
        scopesSupported: scopes,
        resourceName: options.resourceName ?? 'Agent MCP Server',
      };
    };

    return {
      oauth,
      async verify(token) {
        const service = await getService();
        const at = await service.provider.AccessToken.find(token);
        if (!at || at.isExpired) {
          throw new Error('invalid or expired access token');
        }
        const tokenScopes = (at.scope ?? '').split(' ').filter(Boolean);
        const actor = await toActor({
          accountId: at.accountId,
          scopes: tokenScopes,
          clientId: at.clientId,
        });
        return {
          token,
          clientId: at.clientId ?? '',
          scopes: tokenScopes,
          ...(at.exp !== undefined ? { expiresAt: at.exp } : {}),
          extra: { actor },
        };
      },
    };
  };
}

/**
 * Resolve the authkit `OidcService` from the container. `@adonis-agora/authkit-server` augments
 * `ContainerBindings` with `'authkit.server'`, so `make` is fully typed with no cast.
 */
async function resolveAuthKitService(app: ApplicationService): Promise<AuthKitServiceLike> {
  try {
    return await app.container.make('authkit.server');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[@adonis-agora/agent] \`authKitAuth()\` could not resolve the authkit server (${message}). Is \`@adonis-agora/authkit-server\` installed and its provider registered in adonisrc.ts?`,
    );
  }
}

// ── apiKeyAuth ──────────────────────────────────────────────────────────────

/** Resolve the MCP actor from a validated API key. Defaults to `{ id: apiKey }`. */
export type ApiKeyActorResolver = (apiKey: string) => Actor | Promise<Actor>;

/** Options for {@link apiKeyAuth}. */
export interface ApiKeyMcpAuthOptions {
  /** Static API keys clients present in `Authorization: Bearer <key>`. */
  apiKeys: string[];
  /** Map a validated API key to the acting {@link Actor}. Defaults to `{ id: apiKey }`. */
  toActor?: ApiKeyActorResolver;
}

/**
 * Authenticate MCP clients with a static list of API keys (no OAuth metadata). Intended for trusted
 * gateway / machine-to-machine integrations where the host proxies auth and this server just
 * checks the key. Keys are compared with a constant-time compare to resist timing attacks.
 */
export function apiKeyAuth(options: ApiKeyMcpAuthOptions): McpAuthFactory {
  const keys = new Set(options.apiKeys);
  const toActor: ApiKeyActorResolver = options.toActor ?? ((apiKey) => ({ id: apiKey }));
  return async () => {
    return {
      async verify(token) {
        if (![...keys].some((key) => timingSafeEqual(key, token))) {
          throw new Error('invalid API key');
        }
        const actor = await toActor(token);
        return { token, clientId: token, scopes: [], extra: { actor } };
      },
    };
  };
}

/** Constant-time string comparison (no `node:crypto` import at module top to keep the browser-safe build). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

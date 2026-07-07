import { DefaultRolesPolicy } from './tool-registry.js';
import type { Actor, ToolSpec } from './types.js';

/**
 * The default tool authorizer the provider binds when `config/agent.ts` sets no `authorizer` /
 * `rolesPolicy`. Fail-closed and ADMIN-only by default: a tool that declares no `roles` is offered
 * (and invocable) ONLY to an actor holding one of the configured `defaultRoles` (`['ADMIN']` unless
 * overridden). Authorization is a plain set intersection of the actor's roles against the tool's.
 *
 * This is a thin, explicitly-named binding over core's {@link DefaultRolesPolicy} (the `RolesPolicy`
 * seam) so apps that plug an ability-aware gate (`@adonis-agora/authz` Bouncer adapter) swap ONLY the
 * binding, never the seam. The double check — offered-tools filter AND an invoke-time re-check inside
 * `ToolRegistry.invoke` — both run through this same `can(actor, tool)`.
 */
export class DefaultToolAuthorizer extends DefaultRolesPolicy {
  constructor(defaultRoles: string[] = ['ADMIN']) {
    super(defaultRoles);
  }

  override can(actor: Actor, tool: ToolSpec): boolean {
    return super.can(actor, tool);
  }
}

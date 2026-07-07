import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { AiToolCtx, ToolHandler } from './spi/tool.js';
import type { ToolSpec } from './types.js';

/**
 * The symbol the `@AiTool` decorator stamps its options onto (the tool class), read back by
 * discovery to register the class into the {@link import('./tool-registry.js').ToolRegistry}. A
 * global-registry symbol (`Symbol.for`) so it survives duplicate copies of this package in a tree.
 */
export const AI_TOOL_META_KEY: unique symbol = Symbol.for('@agora/agent:ai-tool-meta');

/**
 * Brand stamped on the object {@link defineTool} returns so discovery picks it up when it walks a
 * module's exports — the functional alternative to an `@AiTool` class.
 */
export const AGENT_TOOL_BRAND: unique symbol = Symbol.for('@agora/agent:functional-tool');

export interface AiToolOptions {
  name: string;
  /**
   * `read` auto-executes; `action` requires HITL approval. (Core's `ToolKind` also has `agent` for
   * delegation, but that kind is synthesized from an agent's `delegatesTo` — never authored here.)
   */
  kind: 'read' | 'action';
  description: string;
  /**
   * Input schema as a [Standard Schema](https://standardschema.dev) — Zod, Valibot, or ArkType.
   * Validated (again) before the handler runs.
   */
  input: StandardSchemaV1;
  /** Roles allowed to invoke. Omit to inherit the config's `defaultRoles` (ADMIN-only by default). */
  roles?: string[];
  /**
   * Authz ability checked by an ability-aware `RolesPolicy` (e.g. an `@adonis-agora/authz` Bouncer
   * adapter → `bouncer.forUser(actor).allows(ability)`). Ignored by the default role-based policy.
   */
  ability?: string;
}

/** The metadata the `@AiTool` decorator stamps onto a class for discovery + registration. */
export type AiToolMeta = AiToolOptions;

/** Structural shape of an `@AiTool` class: a constructor whose instance implements `execute`. */
export type ToolClass = abstract new (...args: never[]) => ToolHandler;

/**
 * Marks a class as an AI tool. The class must implement `execute(input, ctx)`. The provider's
 * `app/agent_tools` discovery (or the generated `hooks/tools` barrel) registers every `@AiTool`
 * class into the shared `ToolRegistry` at boot.
 *
 * ```ts
 * @AiTool({ name: 'getWeather', kind: 'read', description: '...', input: z.object({ city: z.string() }) })
 * export default class GetWeatherTool implements ToolHandler<{ city: string }> {
 *   async execute(input: { city: string }, ctx: AiToolCtx) { return { tempC: 21 } }
 * }
 * ```
 */
export function AiTool(options: AiToolOptions) {
  return <T extends ToolClass>(target: T): T => {
    Object.defineProperty(target, AI_TOOL_META_KEY, {
      value: options,
      enumerable: false,
      configurable: true,
    });
    return target;
  };
}

/** Read the {@link AiToolMeta} an `@AiTool` decorator stamped on a class (or an instance's ctor). */
export function readAiToolMeta(target: unknown): AiToolMeta | undefined {
  if (target === null || (typeof target !== 'function' && typeof target !== 'object')) {
    return undefined;
  }
  const direct = (target as { [AI_TOOL_META_KEY]?: AiToolMeta })[AI_TOOL_META_KEY];
  if (direct !== undefined) {
    return direct;
  }
  const ctor = (target as { constructor?: { [AI_TOOL_META_KEY]?: AiToolMeta } }).constructor;
  return ctor?.[AI_TOOL_META_KEY];
}

/** A tool expressed as data + handler (from {@link defineTool}), not an `@AiTool` class. */
export interface FunctionalTool {
  spec: ToolSpec;
  handler: ToolHandler;
}

/** A {@link FunctionalTool} carrying {@link AGENT_TOOL_BRAND} — what {@link defineTool} returns. */
export interface BrandedFunctionalTool extends FunctionalTool {
  readonly [AGENT_TOOL_BRAND]: true;
}

/** Narrows an arbitrary module export to a branded functional tool for boot-time registration. */
export function isBrandedFunctionalTool(value: unknown): value is BrandedFunctionalTool {
  return (
    typeof value === 'object' &&
    value !== null &&
    AGENT_TOOL_BRAND in value &&
    'spec' in value &&
    'handler' in value
  );
}

/**
 * The functional form of a tool: pass the same options as `@AiTool` plus an `execute` function, get
 * back a branded `{ spec, handler }` that discovery auto-registers. Export it from an `app/agent_tools`
 * module (or pass it to `defineConfig({ tools })`).
 *
 * ```ts
 * export const purgeCache = defineTool(
 *   { name: 'purgeCache', kind: 'action', description: '...', input: z.object({ key: z.string() }) },
 *   async ({ key }, ctx) => { ... },
 * )
 * ```
 */
export function defineTool<I = unknown>(
  options: AiToolOptions,
  execute: (input: I, ctx: AiToolCtx) => Promise<unknown> | unknown,
): BrandedFunctionalTool {
  const spec: ToolSpec = {
    name: options.name,
    kind: options.kind,
    description: options.description,
    inputSchema: options.input,
    ...(options.roles !== undefined ? { roles: options.roles } : {}),
    ...(options.ability !== undefined ? { ability: options.ability } : {}),
  };
  return {
    [AGENT_TOOL_BRAND]: true,
    spec,
    handler: { execute: (input, ctx) => Promise.resolve(execute(input as I, ctx)) },
  };
}

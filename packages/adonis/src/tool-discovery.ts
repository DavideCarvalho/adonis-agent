import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type AiToolMeta,
  type FunctionalTool,
  type ToolClass,
  isBrandedFunctionalTool,
  readAiToolMeta,
} from './ai-tool-ref.js';
import type { ToolHandler } from './spi/tool.js';
import type { ToolRegistry } from './tool-registry.js';
import type { ToolSpec } from './types.js';

/** A tool registered at boot, echoed back so the provider can log what it wired. */
export interface RegisteredTool {
  name: string;
  source: 'class' | 'functional';
}

/**
 * Register one module export into the registry if it is an `@AiTool` class or a `defineTool(...)`
 * functional tool; ignore anything else. A name already present is skipped (first wins). Returns the
 * registered descriptor, or `null` when the export was not a tool / duplicated a registered name.
 */
export function registerToolExport(
  registry: ToolRegistry,
  exported: unknown,
  defaultRoles: string[],
): RegisteredTool | null {
  // A functional tool: a branded { spec, handler } from `defineTool`.
  if (isBrandedFunctionalTool(exported)) {
    return registerFunctionalTool(registry, exported, defaultRoles);
  }
  // An `@AiTool` class: read its stamped metadata, instantiate once, bind `execute`.
  const meta = readAiToolMeta(exported);
  if (meta === undefined || typeof exported !== 'function') {
    return null;
  }
  const instance = instantiate(exported as ToolClass);
  if (instance === null || typeof instance.execute !== 'function') {
    return null;
  }
  if (registry.has(meta.name)) {
    return null;
  }
  registry.register(specFromMeta(meta, defaultRoles), {
    execute: (input, ctx) => instance.execute(input, ctx),
  });
  return { name: meta.name, source: 'class' };
}

/** Register a `defineTool` functional tool, applying `defaultRoles` when it declares none. */
export function registerFunctionalTool(
  registry: ToolRegistry,
  tool: FunctionalTool,
  defaultRoles: string[],
): RegisteredTool | null {
  if (registry.has(tool.spec.name)) {
    return null;
  }
  const spec: ToolSpec =
    tool.spec.roles === undefined ? { ...tool.spec, roles: defaultRoles } : tool.spec;
  registry.register(spec, tool.handler);
  return { name: tool.spec.name, source: 'functional' };
}

function specFromMeta(meta: AiToolMeta, defaultRoles: string[]): ToolSpec {
  return {
    name: meta.name,
    kind: meta.kind,
    description: meta.description,
    inputSchema: meta.input,
    roles: meta.roles ?? defaultRoles,
    ...(meta.ability !== undefined ? { ability: meta.ability } : {}),
  };
}

function instantiate(cls: ToolClass): ToolHandler | null {
  try {
    const Ctor = cls as unknown as new () => ToolHandler;
    return new Ctor();
  } catch {
    return null;
  }
}

/**
 * Pick the module extension for the running environment so a built app (`.js`) and a dev/ts app
 * (`.ts`, run under a loader) never double-register the same tool — matching the durable scanner.
 */
const MODULE_EXT = extname(import.meta.url || '') === '.ts' ? '.ts' : '.js';

/**
 * Scan `dir` RECURSIVELY for modules and register every exported `@AiTool` class / `defineTool`
 * tool into `registry` — the `app/agent_tools` convention. Only the environment-appropriate extension
 * is imported and each export is visited once (deduped), so a built `.js` and a dev `.ts` of the same
 * module never both register. Missing directory → no-op (the convention is opt-in). `defaultRoles`
 * fills a tool that declares no `roles` (ADMIN-only by default).
 */
export async function discoverTools(
  registry: ToolRegistry,
  dir: string,
  defaultRoles: string[],
): Promise<RegisteredTool[]> {
  let entries: string[];
  try {
    entries = await readdir(dir, { recursive: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  const registered: RegisteredTool[] = [];
  const seen = new Set<unknown>();
  for (const entry of entries.sort()) {
    if (extname(entry) !== MODULE_EXT || entry.endsWith(`.d${MODULE_EXT}`)) {
      continue;
    }
    const mod = (await import(pathToFileURL(join(dir, entry)).href)) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (seen.has(exported)) {
        continue;
      }
      seen.add(exported);
      const result = registerToolExport(registry, exported, defaultRoles);
      if (result !== null) {
        registered.push(result);
      }
    }
  }
  return registered;
}

/**
 * The build-time barrel shape the Assembler `init` hook generates for `app/agent_tools`
 * (key → lazy module import), mirroring durable's steps/workflows barrels.
 */
export type ToolsBarrel = Record<string, () => Promise<Record<string, unknown>>>;

/**
 * Register every `@AiTool` / `defineTool` reachable from a generated {@link ToolsBarrel} — the
 * build-time equivalent of {@link discoverTools} with no runtime `readdir`. Each module is imported
 * once and each export registered once (deduped).
 */
export async function registerToolsFromBarrel(
  registry: ToolRegistry,
  barrel: ToolsBarrel,
  defaultRoles: string[],
): Promise<RegisteredTool[]> {
  const registered: RegisteredTool[] = [];
  const seen = new Set<unknown>();
  for (const load of Object.values(barrel)) {
    const mod = await load();
    for (const exported of Object.values(mod)) {
      if (seen.has(exported)) {
        continue;
      }
      seen.add(exported);
      const result = registerToolExport(registry, exported, defaultRoles);
      if (result !== null) {
        registered.push(result);
      }
    }
  }
  return registered;
}

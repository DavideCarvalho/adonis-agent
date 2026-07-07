import type { IndexGenerator } from '@adonisjs/assembler/index_generator';

/**
 * Where the generated tools barrel is written, relative to the app root. The agent provider imports
 * THIS path at boot (build-time codegen) instead of scanning `app/agent_tools` with `readdir` at
 * runtime. Kept in sync with the module the provider imports.
 */
export const GENERATED_TOOLS_OUTPUT = '.adonisjs/agent/tools.ts';

/** Options for {@link toolsHook} — mirror the relevant `IndexGenerator.add` knobs. */
export interface ToolsHookOptions {
  /** Directory the generator scans for tool modules, relative to the app root. Default `app/agent_tools`. */
  source?: string;
  /** Import alias the generated barrel uses for each tool module. Default `#agent_tools`. */
  importAlias?: string;
  /** Output path for the generated barrel, relative to the app root. Default `.adonisjs/agent/tools.ts`. */
  output?: string;
}

/**
 * An AdonisJS **Assembler `init` hook** that generates a typed barrel of the app's `app/agent_tools/`
 * directory at build/dev time — exactly how `@adonisjs/core` generates the controllers/events barrels
 * and how `@adonis-agora/durable`'s steps hook does for `app/steps`. The provider imports the generated
 * `.adonisjs/agent/tools.ts` at boot and registers every `@AiTool`/`defineTool` export it finds
 * (falling back to the runtime scan when the barrel is absent).
 *
 * Register it in `adonisrc.ts`:
 *
 * ```ts
 * export default defineConfig({
 *   hooks: {
 *     init: [() => import('@adonis-agora/agent/hooks/tools')],
 *   },
 * })
 * ```
 */
export function toolsHook(options: ToolsHookOptions = {}) {
  const source = options.source ?? 'app/agent_tools';
  const importAlias = options.importAlias ?? '#agent_tools';
  const output = options.output ?? GENERATED_TOOLS_OUTPUT;

  return {
    run(_parent: unknown, _hooks: unknown, indexGenerator: IndexGenerator): void {
      indexGenerator.add('agent_tools', {
        source,
        as: 'barrelFile',
        exportName: 'tools',
        importAlias,
        removeSuffix: 'tool',
        skipSegments: ['agent_tools'],
        output,
        comment: true,
      });
    },
  };
}

/**
 * The default export is the hook object itself, so `() => import('@adonis-agora/agent/hooks/tools')`
 * in `adonisrc.ts` resolves to a ready hook (the assembler calls its `run`).
 */
export default toolsHook();

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AgentRegistry,
  AiTool,
  ToolRegistry,
  defineTool,
  delegateToolName,
  readAiToolMeta,
  registerDelegateTools,
  registerToolExport,
  registerToolsFromBarrel,
} from '../src/index.js';
import type { AiToolCtx, ToolHandler } from '../src/index.js';

@AiTool({
  name: 'getWeather',
  kind: 'read',
  description: 'Get the weather',
  input: z.object({ city: z.string() }),
})
class GetWeatherTool implements ToolHandler<{ city: string }> {
  async execute(input: { city: string }, _ctx: AiToolCtx) {
    return { tempC: 21, city: input.city };
  }
}

const purgeCache = defineTool(
  { name: 'purgeCache', kind: 'action', description: 'Purge a cache key', input: z.object({ key: z.string() }) },
  async ({ key }: { key: string }) => ({ purged: key }),
);

describe('tool discovery', () => {
  it('reads @AiTool metadata off a decorated class', () => {
    const meta = readAiToolMeta(GetWeatherTool);
    expect(meta?.name).toBe('getWeather');
    expect(meta?.kind).toBe('read');
  });

  it('registers an @AiTool class into the ToolRegistry (roles default to ADMIN)', () => {
    const registry = new ToolRegistry();
    const result = registerToolExport(registry, GetWeatherTool, ['ADMIN']);
    expect(result).toEqual({ name: 'getWeather', source: 'class' });
    expect(registry.has('getWeather')).toBe(true);
    expect(registry.spec('getWeather')?.roles).toEqual(['ADMIN']);
  });

  it('registers a defineTool functional tool', () => {
    const registry = new ToolRegistry();
    const result = registerToolExport(registry, purgeCache, ['ADMIN']);
    expect(result).toEqual({ name: 'purgeCache', source: 'functional' });
    expect(registry.spec('purgeCache')?.kind).toBe('action');
  });

  it('registers every tool reachable from a generated barrel (deduped)', async () => {
    const registry = new ToolRegistry();
    const barrel = {
      weather: () => Promise.resolve({ default: GetWeatherTool }),
      cache: () => Promise.resolve({ purgeCache }),
    };
    const registered = await registerToolsFromBarrel(registry, barrel, ['ADMIN']);
    expect(registered.map((r) => r.name).sort()).toEqual(['getWeather', 'purgeCache']);
    expect(registry.has('getWeather')).toBe(true);
    expect(registry.has('purgeCache')).toBe(true);
  });

  it('synthesizes an agent-kind delegate tool per delegatesTo edge', () => {
    const registry = new ToolRegistry();
    const agents = new AgentRegistry();
    agents.register({ name: 'orchestrator', delegatesTo: ['researcher'] });
    agents.register({ name: 'researcher', systemPrompt: 'You research things.' });
    const count = registerDelegateTools(registry, agents);
    expect(count).toBe(1);
    const name = delegateToolName('researcher');
    expect(name).toBe('ask_researcher');
    const spec = registry.spec(name);
    expect(spec?.kind).toBe('agent');
    expect(spec?.targetAgent).toBe('researcher');
    expect(spec?.description).toContain('You research things.');
  });

  it('skips a tool whose name is already registered (first wins)', () => {
    const registry = new ToolRegistry();
    expect(registerToolExport(registry, GetWeatherTool, ['ADMIN'])).not.toBeNull();
    expect(registerToolExport(registry, GetWeatherTool, ['ADMIN'])).toBeNull();
  });
});

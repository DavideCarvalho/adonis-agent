import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readAiToolMeta } from '../src/ai-tool-ref.js';
import { BaseTool } from '../src/base-tool.js';
import type { AiToolCtx } from '../src/spi/tool.js';

/**
 * A tool authored via the class form WITHOUT `satisfies AiToolOptions` — the `static tool` is
 * type-checked by the inherited `BaseTool.tool?: AiToolOptions` declaration. `<Input, Output>` types
 * `execute`'s input and return.
 */
class Echo extends BaseTool<{ msg: string }, string> {
  static tool = {
    name: 'echo',
    kind: 'read' as const,
    description: 'Devolve a mensagem recebida.',
    input: z.object({ msg: z.string() }),
    ability: 'demo.echo',
  };

  async execute(input: { msg: string }, _ctx: AiToolCtx): Promise<string> {
    return input.msg;
  }
}

describe('BaseTool', () => {
  it('a subclass static tool is read by discovery — no `satisfies` needed', () => {
    const meta = readAiToolMeta(Echo);
    expect(meta?.name).toBe('echo');
    expect(meta?.ability).toBe('demo.echo');
  });

  it('the abstract base carries no static tool, so it is never registered itself', () => {
    expect(readAiToolMeta(BaseTool)).toBeUndefined();
  });

  it('execute runs and returns the typed output', async () => {
    const out = await new Echo().execute({ msg: 'hi' }, {} as AiToolCtx);
    expect(out).toBe('hi');
  });
});

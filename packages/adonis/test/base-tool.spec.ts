import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readAiToolMeta } from '../src/ai-tool-ref.js';
import { ActionTool, BaseTool, ReadTool } from '../src/base-tool.js';
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

/**
 * A forma truly bare: `ReadTool`/`ActionTool` fixam o `kind`, então o `static tool` da subclasse não
 * declara `kind` — sem `satisfies`, sem anotação. A descoberta lê o `kind` da estática do base.
 */
class BareRead extends ReadTool<{ q: string }, string[]> {
  static tool = {
    name: 'bare_read',
    description: 'Sem kind no static tool — vem do ReadTool.',
    input: z.object({ q: z.string() }),
    ability: 'demo.bare.read',
  };
  async execute(input: { q: string }): Promise<string[]> {
    return [input.q];
  }
}

class BareAction extends ActionTool<{ id: string }, boolean> {
  static tool = {
    name: 'bare_action',
    description: 'Sem kind no static tool — vem do ActionTool.',
    input: z.object({ id: z.string() }),
  };
  async execute(): Promise<boolean> {
    return true;
  }
}

describe('ReadTool / ActionTool (kind fixo no base, static tool bare)', () => {
  it('ReadTool: descoberta lê name + kind="read" (kind vem do base, não do static tool)', () => {
    const meta = readAiToolMeta(BareRead);
    expect(meta?.name).toBe('bare_read');
    expect(meta?.kind).toBe('read');
    expect(meta?.ability).toBe('demo.bare.read');
  });

  it('ActionTool: kind="action" vem do base', () => {
    const meta = readAiToolMeta(BareAction);
    expect(meta?.name).toBe('bare_action');
    expect(meta?.kind).toBe('action');
  });
});

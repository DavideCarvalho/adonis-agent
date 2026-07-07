import { afterEach, describe, expect, it } from 'vitest';
import { publishAgentRunStarted, publishAgentToolCall } from '../src/index.js';

const EMIT_SLOT = Symbol.for('@agora/diagnostics:emit');

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[EMIT_SLOT];
});

describe('diagnostics structural emit slot', () => {
  it('is a no-op when no diagnostics emitter is installed', () => {
    expect(() =>
      publishAgentRunStarted({ runId: 'r1', threadId: 't1', actorId: 'u1' }),
    ).not.toThrow();
  });

  it('forwards agent events to the global emit slot on agora:agent:*', () => {
    const events: Array<{ lib: string; event: string; payload: unknown }> = [];
    (globalThis as Record<symbol, unknown>)[EMIT_SLOT] = (
      lib: string,
      event: string,
      payload: unknown,
    ) => {
      events.push({ lib, event, payload });
    };

    publishAgentRunStarted({ runId: 'r1', threadId: 't1', actorId: 'u1' });
    publishAgentToolCall({
      runId: 'r1',
      toolName: 'search',
      toolType: 'read',
      status: 'executed',
    });

    expect(events.map((e) => `${e.lib}:${e.event}`)).toEqual([
      'agent:run.started',
      'agent:tool-call',
    ]);
    expect(events[0]?.payload).toMatchObject({ runId: 'r1', threadId: 't1', actorId: 'u1' });
  });

  it('never lets a throwing emitter escape into the caller', () => {
    (globalThis as Record<symbol, unknown>)[EMIT_SLOT] = () => {
      throw new Error('diagnostics boom');
    };
    expect(() =>
      publishAgentRunStarted({ runId: 'r1', threadId: 't1', actorId: 'u1' }),
    ).not.toThrow();
  });
});

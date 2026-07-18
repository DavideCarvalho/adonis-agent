import { describe, expect, it } from 'vitest';
import {
  type ChatPart,
  decodeFrame,
  foldPart,
  parseSseEvent,
  readSseStream,
} from '../src/client/index.js';

function sseStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
  });
}

describe('parseSseEvent', () => {
  it('reads a named event and its data', () => {
    expect(parseSseEvent('event: component\ndata: {"name":"x"}')).toEqual({
      event: 'component',
      data: '{"name":"x"}',
    });
  });

  it('defaults the event name to message', () => {
    expect(parseSseEvent('data: {"delta":"oi"}')).toEqual({
      event: 'message',
      data: '{"delta":"oi"}',
    });
  });

  it('returns null for a frame with no data line (keep-alive)', () => {
    expect(parseSseEvent('event: done')).toBeNull();
    expect(parseSseEvent(': keep-alive')).toBeNull();
  });
});

describe('decodeFrame', () => {
  it('decodes text, component, meta and done', () => {
    expect(decodeFrame({ event: 'message', data: '{"delta":"hi"}' })).toEqual({
      type: 'text',
      delta: 'hi',
    });
    expect(decodeFrame({ event: 'component', data: '{"name":"chart","data":{"m":1}}' })).toEqual({
      type: 'component',
      name: 'chart',
      data: { m: 1 },
    });
    expect(decodeFrame({ event: 'meta', data: '{"runId":"r1","threadId":"t1"}' })).toEqual({
      type: 'meta',
      runId: 'r1',
      threadId: 't1',
    });
    expect(decodeFrame({ event: 'done', data: '{}' })).toEqual({ type: 'done' });
  });

  it('returns null for malformed or empty payloads', () => {
    expect(decodeFrame({ event: 'message', data: 'not-json' })).toBeNull();
    expect(decodeFrame({ event: 'message', data: 'null' })).toBeNull();
    expect(decodeFrame({ event: 'message', data: '{"delta":""}' })).toBeNull();
    expect(decodeFrame({ event: 'component', data: '{"data":{}}' })).toBeNull(); // no name
  });
});

describe('foldPart', () => {
  it('concatenates consecutive text deltas', () => {
    let parts: ChatPart[] = [];
    parts = foldPart(parts, { type: 'text', delta: 'oi ' });
    parts = foldPart(parts, { type: 'text', delta: 'mundo' });
    expect(parts).toEqual([{ type: 'text', text: 'oi mundo' }]);
  });

  it('appends components in order, keeping text segments separate', () => {
    let parts: ChatPart[] = [{ type: 'text', text: 'olha ' }];
    parts = foldPart(parts, { type: 'component', name: 'grafico', data: { m: 'glicose' } });
    parts = foldPart(parts, { type: 'text', delta: 'pronto' });
    expect(parts).toEqual([
      { type: 'text', text: 'olha ' },
      { type: 'component', name: 'grafico', data: { m: 'glicose' } },
      { type: 'text', text: 'pronto' },
    ]);
  });

  it('ignores meta and done control frames', () => {
    const parts: ChatPart[] = [{ type: 'text', text: 'x' }];
    expect(foldPart(parts, { type: 'meta', runId: 'r' })).toEqual(parts);
    expect(foldPart(parts, { type: 'done' })).toEqual(parts);
  });
});

describe('readSseStream', () => {
  it('splits frames across chunk boundaries', async () => {
    // The `\n\n` separator is split across two chunks to exercise the buffer.
    const stream = sseStream(['data: {"delta":"a"}\n', '\ndata: {"delta":"b"}\n\n']);
    const events = [];
    for await (const event of readSseStream(stream)) {
      events.push(event);
    }
    expect(events).toEqual([
      { event: 'message', data: '{"delta":"a"}' },
      { event: 'message', data: '{"delta":"b"}' },
    ]);
  });
});

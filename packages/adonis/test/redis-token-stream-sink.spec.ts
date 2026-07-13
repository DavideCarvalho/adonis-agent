import { describe, expect, it } from 'vitest';
import { InProcessTokenStreamSink, RedisTokenStreamSink } from '../src/index.js';
import type { RedisStreamClient } from '../src/index.js';

/**
 * An in-memory stand-in for a Redis server (NOT a client) shared across sink instances — modelling the
 * one thing a real multi-replica deployment shares: the Redis server itself. Each `redis.client()`
 * returns an independent {@link RedisStreamClient} view over the SAME lists/values/subscriptions, so a
 * write on one replica's sink is visible to a subscriber on another replica's sink.
 */
class FakeRedisServer {
  readonly lists = new Map<string, string[]>();
  readonly values = new Map<string, string>();
  readonly subs = new Map<string, Set<(message: string) => void>>();

  client(): RedisStreamClient {
    return {
      rpush: async (key, value) => {
        const list = this.lists.get(key) ?? [];
        list.push(value);
        this.lists.set(key, list);
      },
      lrange: async (key, start, stop) => {
        const list = this.lists.get(key) ?? [];
        return stop === -1 ? list.slice(start) : list.slice(start, stop + 1);
      },
      set: async (key, value) => {
        this.values.set(key, value);
      },
      get: async (key) => this.values.get(key) ?? null,
      publish: async (channel, message) => {
        // Deliver asynchronously, like a real pub/sub — proves the notify bridge, not a sync coincidence.
        for (const handler of [...(this.subs.get(channel) ?? [])]) {
          queueMicrotask(() => handler(message));
        }
      },
      subscribe: async (channel, onMessage) => {
        const handlers = this.subs.get(channel) ?? new Set();
        handlers.add(onMessage);
        this.subs.set(channel, handlers);
        return async () => {
          handlers.delete(onMessage);
        };
      },
      del: async (...keys) => {
        for (const key of keys) {
          this.lists.delete(key);
          this.values.delete(key);
        }
      },
    };
  }
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

async function collect(iterable: AsyncIterable<Uint8Array>): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for await (const chunk of iterable) {
    out.push(chunk);
  }
  return out;
}

function decodeAll(chunks: Uint8Array[]): string {
  const decoder = new TextDecoder();
  return chunks.map((c) => decoder.decode(c)).join('');
}

describe('RedisTokenStreamSink', () => {
  it('fans a run across replicas: a subscriber on replica B receives frames a writer on replica A published', async () => {
    const server = new FakeRedisServer();
    const replicaA = new RedisTokenStreamSink(server.client());
    const replicaB = new RedisTokenStreamSink(server.client());

    // Replica B serves the SSE (subscribes first), replica A runs the model.
    const collected = collect(replicaB.subscribe('run-x'));
    const writer = replicaA.open('run-x');
    await writer.write(encode('Hel'));
    await writer.write(encode('lo, '));
    await writer.write(encode('world'));
    await writer.end();

    const chunks = await collected;
    expect(decodeAll(chunks)).toBe('Hello, world');
    // Frame boundaries are preserved 1:1 (each write → one yielded chunk → one SSE `data:` frame).
    expect(chunks.map((c) => new TextDecoder().decode(c))).toEqual(['Hel', 'lo, ', 'world']);
  });

  it('replays buffered chunks for a late subscriber that connects after the run ended', async () => {
    const server = new FakeRedisServer();
    const writerSink = new RedisTokenStreamSink(server.client());
    const writer = writerSink.open('run-late');
    await writer.write(encode('a'));
    await writer.write(encode('b'));
    await writer.end();

    const readerSink = new RedisTokenStreamSink(server.client());
    expect(decodeAll(await collect(readerSink.subscribe('run-late')))).toBe('ab');
  });

  it('produces a chunk stream byte-identical to the in-process sink (unchanged SSE envelope)', async () => {
    const frames = ['The ', 'quick ', 'brown ', 'fox'];

    const inProcess = new InProcessTokenStreamSink();
    const inWriter = inProcess.open('run-eq');
    for (const f of frames) inWriter.write(encode(f));
    inWriter.end();
    const inChunks = await collect(inProcess.subscribe('run-eq'));

    const server = new FakeRedisServer();
    const redis = new RedisTokenStreamSink(server.client());
    const reWriter = redis.open('run-eq');
    for (const f of frames) await reWriter.write(encode(f));
    await reWriter.end();
    const reChunks = await collect(redis.subscribe('run-eq'));

    // Same number of frames, same bytes per frame → identical `data: {"delta":...}` SSE output.
    expect(reChunks.map((c) => [...c])).toEqual(inChunks.map((c) => [...c]));
  });

  it('ends the subscriber stream when the writer ends (no hang)', async () => {
    const server = new FakeRedisServer();
    const sink = new RedisTokenStreamSink(server.client());
    const writer = sink.open('run-end');
    await writer.write(encode('x'));
    await writer.end();

    // If `end()` did not terminate the stream, this `for await` would never resolve.
    expect(decodeAll(await collect(sink.subscribe('run-end')))).toBe('x');
  });

  it('close() drops the run buffer and terminal marker so the shared keys are cleaned up', async () => {
    const server = new FakeRedisServer();
    const sink = new RedisTokenStreamSink(server.client());
    const writer = sink.open('run-close');
    await writer.write(encode('gone'));
    await writer.end();
    expect(server.lists.size).toBeGreaterThan(0);
    expect(server.values.size).toBeGreaterThan(0);

    await sink.close('run-close');
    expect(server.lists.size).toBe(0);
    expect(server.values.size).toBe(0);
  });

  it('honours a custom keyPrefix for its list, state and channel keys', async () => {
    const server = new FakeRedisServer();
    const sink = new RedisTokenStreamSink(server.client(), { keyPrefix: 'custom:ns' });
    // A subscriber registers the pub/sub channel; the writer creates the list + state keys.
    const collected = collect(sink.subscribe('run-1'));
    const writer = sink.open('run-1');
    await writer.write(encode('hi'));
    await writer.end();
    await collected;

    expect([...server.lists.keys()]).toContain('custom:ns:run-1:chunks');
    expect([...server.values.keys()]).toContain('custom:ns:run-1:state');
    expect([...server.subs.keys()]).toContain('custom:ns:run-1');
  });
});

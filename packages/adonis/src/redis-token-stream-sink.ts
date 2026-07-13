import type { RedisStreamClient } from './redis-stream-client.js';
import type { SinkWriter, TokenStreamSink } from './spi/token-stream-sink.js';

/** Marker stored at the state key once a run's stream has finished. */
const ENDED = 'ended';

export interface RedisTokenStreamSinkOptions {
  /** Key/channel namespace. Defaults to `agent:stream`. Keys are `${keyPrefix}:${runId}:...`. */
  keyPrefix?: string;
}

/**
 * A multi-replica {@link TokenStreamSink} over Redis — the shared-transport counterpart to the default
 * {@link import('./in-process-sink.js').InProcessTokenStreamSink}. The replica running the model turn
 * `open`s the writer and appends each token chunk to a Redis LIST (`${keyPrefix}:${runId}:chunks`) so
 * ANY replica can replay the whole stream so far (the same late-subscriber/reconnect guarantee the
 * in-process sink gives, but shared across pods), and PUBLISHes to a per-run channel
 * (`${keyPrefix}:${runId}`) to wake live subscribers. The run's terminal state lives in a marker key
 * (`${keyPrefix}:${runId}:state`), so an SSE handler on ANOTHER replica that subscribes after the run
 * finished still sees the ending and closes the stream.
 *
 * The yielded chunks are byte-identical to the in-process sink's, so the SSE envelope the provider
 * pipes (`data: {"delta":...}`) is unchanged — swapping this in is transparent to clients.
 *
 * The host supplies a {@link RedisStreamClient} adapter over its own Redis driver; `subscribe` needs a
 * connection in subscriber mode (see the client docs). Wire it with `defineConfig({ sink:
 * tokenSinks.redis({...}) })`, which builds the adapter over `@adonisjs/redis` lazily.
 */
export class RedisTokenStreamSink implements TokenStreamSink {
  private readonly keyPrefix: string;

  constructor(
    private readonly client: RedisStreamClient,
    options: RedisTokenStreamSinkOptions = {},
  ) {
    this.keyPrefix = options.keyPrefix ?? 'agent:stream';
  }

  private chunksKey(runId: string): string {
    return `${this.keyPrefix}:${runId}:chunks`;
  }

  private stateKey(runId: string): string {
    return `${this.keyPrefix}:${runId}:state`;
  }

  private channel(runId: string): string {
    return `${this.keyPrefix}:${runId}`;
  }

  open(runId: string): SinkWriter {
    return {
      write: async (chunk: Uint8Array) => {
        await this.client.rpush(this.chunksKey(runId), toBase64(chunk));
        await this.client.publish(this.channel(runId), 'chunk');
      },
      end: async () => {
        await this.client.set(this.stateKey(runId), ENDED);
        await this.client.publish(this.channel(runId), 'end');
      },
    };
  }

  async *subscribe(runId: string): AsyncIterable<Uint8Array> {
    // Notify bridge: the pub/sub handler resolves the current `wake` promise so the drain loop
    // re-reads the list. A promise is armed BEFORE each drain, so a publish arriving mid-drain is
    // never lost.
    let resolveWake: (() => void) | null = null;
    const onMessage = () => {
      const resolve = resolveWake;
      resolveWake = null;
      resolve?.();
    };
    const unsubscribe = await this.client.subscribe(this.channel(runId), onMessage);
    try {
      let index = 0;
      while (true) {
        const wake = new Promise<void>((resolve) => {
          resolveWake = resolve;
        });
        const chunks = await this.client.lrange(this.chunksKey(runId), index, -1);
        for (const encoded of chunks) {
          index += 1;
          yield fromBase64(encoded);
        }
        if (await this.hasEnded(runId)) {
          return;
        }
        await wake;
      }
    } finally {
      await unsubscribe();
    }
  }

  async close(runId: string): Promise<void> {
    await this.client.del(this.chunksKey(runId), this.stateKey(runId));
  }

  private async hasEnded(runId: string): Promise<boolean> {
    const raw = await this.client.get(this.stateKey(runId));
    return raw === ENDED;
  }
}

function toBase64(chunk: Uint8Array): string {
  return Buffer.from(chunk).toString('base64');
}

function fromBase64(encoded: string): Uint8Array {
  return new Uint8Array(Buffer.from(encoded, 'base64'));
}

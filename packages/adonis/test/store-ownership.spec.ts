import { describe, expect, it } from 'vitest';
import { InMemoryAgentStore } from '../src/testing/index.js';

// The ownership lookups backing the run/thread route checks: getThreadActorRef / getRunActorRef must
// return the owning actor ref, null for an unknown id, and null for a soft-deleted thread.

describe('InMemoryAgentStore ownership lookups', () => {
  it('getThreadActorRef returns the thread owner, null when unknown or soft-deleted', async () => {
    const store = new InMemoryAgentStore();
    const thread = await store.createThread({ actor: { id: 'alice' }, persona: 'default' });

    expect(await store.getThreadActorRef(thread.id)).toBe('alice');
    expect(await store.getThreadActorRef('does-not-exist')).toBeNull();

    await store.softDeleteThread(thread.id);
    expect(await store.getThreadActorRef(thread.id)).toBeNull();
  });

  it('getRunActorRef returns the run owner, null when unknown', async () => {
    const store = new InMemoryAgentStore();
    const thread = await store.createThread({ actor: { id: 'bob' }, persona: 'default' });
    await store.recordRunStart({ runId: 'run-1', threadId: thread.id, actor: { id: 'bob' } });

    expect(await store.getRunActorRef('run-1')).toBe('bob');
    expect(await store.getRunActorRef('unknown-run')).toBeNull();
  });

  it('a run records its own actor even if it differs from the thread owner', async () => {
    // The run route ownership binds to the RUN's actor_ref (recordRunStart), not the thread's.
    const store = new InMemoryAgentStore();
    const thread = await store.createThread({ actor: { id: 'carol' }, persona: 'default' });
    await store.recordRunStart({ runId: 'run-x', threadId: thread.id, actor: { id: 'dave' } });

    expect(await store.getRunActorRef('run-x')).toBe('dave');
  });
});

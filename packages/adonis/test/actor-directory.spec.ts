import { describe, expect, it } from 'vitest';
import type { ActorDirectory } from '../src/index.js';
import { InMemoryActorDirectory } from '../src/testing/index.js';

describe('InMemoryActorDirectory', () => {
  it('resolves known refs to their display labels', async () => {
    const directory: ActorDirectory = new InMemoryActorDirectory({
      u_1: 'Ada Lovelace',
      u_2: 'Alan Turing',
    });

    expect(await directory.resolveDisplay(['u_1', 'u_2'])).toEqual({
      u_1: 'Ada Lovelace',
      u_2: 'Alan Turing',
    });
  });

  it('omits missing refs rather than fabricating a label', async () => {
    const directory = new InMemoryActorDirectory({ u_1: 'Ada Lovelace' });

    const result = await directory.resolveDisplay(['u_1', 'u_unknown']);
    expect(result).toEqual({ u_1: 'Ada Lovelace' });
    expect('u_unknown' in result).toBe(false);
  });

  it('returns an empty map when nothing is known', async () => {
    const directory = new InMemoryActorDirectory();
    expect(await directory.resolveDisplay(['a', 'b'])).toEqual({});
    expect(await directory.resolveDisplay([])).toEqual({});
  });

  it('set() adds or overwrites a mapping and chains', async () => {
    const directory = new InMemoryActorDirectory({ u_1: 'old' });
    directory.set('u_1', 'new').set('u_2', 'second');

    expect(await directory.resolveDisplay(['u_1', 'u_2'])).toEqual({
      u_1: 'new',
      u_2: 'second',
    });
  });
});

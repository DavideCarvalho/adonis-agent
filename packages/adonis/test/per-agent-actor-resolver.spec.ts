import { describe, expect, it } from 'vitest';
import {
  type Actor,
  type ActorResolver,
  type AgentDefinition,
  resolveActorResolver,
} from '../src/index.js';

/** A resolver that returns a fixed, identifiable actor — lets us assert which one was picked. */
class FixedActorResolver implements ActorResolver {
  constructor(private readonly actor: Actor) {}
  resolve(): Actor {
    return this.actor;
  }
}

const globalResolver = new FixedActorResolver({ id: 'global' });
const perAgentResolver = new FixedActorResolver({ id: 'per-agent' });

describe('resolveActorResolver — per-agent override', () => {
  it("prefers the agent definition's own actorResolver when present", () => {
    const definition: AgentDefinition = {
      name: 'body-reader',
      actorResolver: perAgentResolver,
    };
    const chosen = resolveActorResolver(globalResolver, definition);
    expect(chosen).toBe(perAgentResolver);
    expect((chosen.resolve(undefined) as Actor).id).toBe('per-agent');
  });

  it('falls back to the global resolver when the agent declares none', () => {
    const definition: AgentDefinition = { name: 'plain' };
    expect(resolveActorResolver(globalResolver, definition)).toBe(globalResolver);
  });

  it('falls back to the global resolver when the agent is unknown (undefined definition)', () => {
    expect(resolveActorResolver(globalResolver, undefined)).toBe(globalResolver);
  });
});

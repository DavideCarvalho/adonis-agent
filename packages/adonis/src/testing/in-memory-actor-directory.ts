import type { ActorDirectory } from '../spi/actor-directory.js';

/**
 * In-memory {@link ActorDirectory}: a plain `actorRef → label` map. Handy for tests, the offline demo,
 * and small apps that seed a fixed label table at boot. Missing refs are omitted from the result (never
 * fabricated), so a governance surface falls back to rendering the raw ref.
 */
export class InMemoryActorDirectory implements ActorDirectory {
  private readonly labels: Map<string, string>;

  constructor(labels: Record<string, string> = {}) {
    this.labels = new Map(Object.entries(labels));
  }

  /** Add or overwrite a single ref → label mapping. Returns `this` for chaining. */
  set(ref: string, label: string): this {
    this.labels.set(ref, label);
    return this;
  }

  async resolveDisplay(refs: readonly string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const ref of refs) {
      const label = this.labels.get(ref);
      if (label !== undefined) {
        out[ref] = label;
      }
    }
    return out;
  }
}

/**
 * Turns text into embedding vectors — the retrieval-side sibling of {@link import('./model-provider.js').ModelProvider}.
 * Batched (`texts` → one vector each, in the same order) so ingestion can embed many chunks per call.
 * An adapter implements it (`aiSdkEmbedding` over the Vercel AI SDK `embedMany`, deferred this round);
 * `@adonis-agora/agent/testing` ships a deterministic {@link import('../testing/fake-embedding-provider.js').FakeEmbeddingProvider}
 * for offline tests. Mirrors the reference `EmbeddingProvider` contract exactly.
 */
export interface EmbeddingProvider {
  /** Embed each input string; returns one vector per input, in the same order. */
  embed(texts: string[]): Promise<number[][]>;
}

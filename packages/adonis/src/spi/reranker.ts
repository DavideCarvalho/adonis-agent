import type { Passage } from './retriever.js';

export interface RerankOptions {
  /** Keep only the top N after reranking. Undefined → keep all, reordered. */
  topK?: number;
}

/**
 * Re-scores retrieved passages against the query with a stronger (usually cross-encoder) model than
 * the first-stage retriever — the standard precision boost for RAG. It's a black box like
 * {@link import('./retriever.js').Retriever}: bring a Cohere/Voyage rerank endpoint or a local
 * cross-encoder. Provider implementations are deferred this round (SPI only); the testing kit ships a
 * trivial identity reranker. Mirrors the reference `Reranker` contract exactly.
 */
export interface Reranker {
  /** Re-order `passages` by relevance to `query`, rewriting their `score`; may drop to `topK`. */
  rerank(query: string, passages: Passage[], options?: RerankOptions): Promise<Passage[]>;
}

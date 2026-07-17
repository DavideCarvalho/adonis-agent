import type { Reranker } from '../spi/reranker.js';
import type { Passage, RetrieveOptions, Retriever } from '../spi/retriever.js';

export interface RerankingRetrieverOptions {
  /** How many candidates to pull from the base retriever before reranking. Default 20. */
  fetchTopK?: number;
}

/**
 * Two-stage retrieval: over-fetch cheap candidates from a base {@link Retriever}, then reorder them with
 * a stronger {@link Reranker} and keep the top few. The standard precision boost — a fast first stage
 * casts a wide net, a slow accurate second stage sharpens it. Composes over ANY retriever (vector,
 * hybrid, keyword), and is itself a `Retriever` so it drops straight into the config's `retriever` slot.
 * Mirrors the reference `RerankingRetriever` exactly.
 */
export class RerankingRetriever implements Retriever {
  constructor(
    private readonly base: Retriever,
    private readonly reranker: Reranker,
    private readonly options: RerankingRetrieverOptions = {},
  ) {}

  async retrieve(query: string, options: RetrieveOptions = {}): Promise<Passage[]> {
    const candidates = await this.base.retrieve(query, {
      topK: this.options.fetchTopK ?? 20,
      ...(options.filter !== undefined ? { filter: options.filter } : {}),
    });
    return this.reranker.rerank(query, candidates, { topK: options.topK ?? 5 });
  }
}

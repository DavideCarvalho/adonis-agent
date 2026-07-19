import type { EmbeddingProvider } from '../spi/embedding-provider.js';
import type { Passage, RetrieveOptions, Retriever } from '../spi/retriever.js';
import type { VectorStore } from './vector-store.js';

/**
 * Bridges an {@link EmbeddingProvider} + {@link VectorStore} into the {@link Retriever} SPI: embed the
 * query, then vector-search. This is what you wire as the agent's `retriever` (via the `retrievers`
 * factory namespace) for inject-mode retrieval. Mirrors the reference `EmbeddingRetriever` exactly.
 */
export class EmbeddingRetriever implements Retriever {
  constructor(
    private readonly embedder: EmbeddingProvider,
    private readonly store: VectorStore,
  ) {}

  async retrieve(query: string, options: RetrieveOptions = {}): Promise<Passage[]> {
    const [embedding] = await this.embedder.embed([query]);
    if (embedding === undefined) {
      return [];
    }
    return this.store.search(embedding, {
      topK: options.topK ?? 5,
      ...(options.filter !== undefined ? { filter: options.filter } : {}),
      ...(options.minScore !== undefined ? { minScore: options.minScore } : {}),
    });
  }
}

/**
 * Retrieval seam for RAG. A `Retriever` is a black box — the agent loop asks it for the passages most
 * relevant to a query and never sees how (vector search, keyword, hybrid, a remote service). This
 * package ships an {@link import('../rag/embedding-retriever.js').EmbeddingRetriever} (embed + vector
 * store) built via the `retrievers` factory namespace, but any impl satisfying this SPI works. Wired
 * on the config's `retriever` it drives always-on ("inject") retrieval: the loop retrieves once for
 * the user message and folds the passages into the system prompt. Mirrors the reference `Retriever`
 * contract exactly.
 */

/** One retrieved passage. `source` is a human/citation-facing origin; `score` is impl-defined relevance. */
export interface Passage {
  id: string;
  text: string;
  score: number;
  /** Where the passage came from (document title, URL, row id) — surfaced as a citation. */
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface RetrieveOptions {
  /** Max passages to return. The impl may cap it; the loop defaults to 5 when unset. */
  topK?: number;
  /** Impl-specific metadata filter (e.g. `{ tenantRef }`). Opaque to the runtime. */
  filter?: Record<string, unknown>;
}

export interface Retriever {
  retrieve(query: string, options?: RetrieveOptions): Promise<Passage[]>;
}

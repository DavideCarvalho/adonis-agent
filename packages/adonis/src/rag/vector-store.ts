import type { Passage } from '../spi/retriever.js';

/** A stored, embedded chunk. `embedding` length must match the store's configured dimensions. */
export interface VectorRecord {
  id: string;
  text: string;
  embedding: number[];
  /** Citation-facing origin (document title, URL, row id). */
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface VectorSearchOptions {
  topK: number;
  /**
   * Metadata filter, passed through from `RetrieveOptions.filter`. A scalar value is exact-match; an
   * array value is match-any (OR / set membership), with an empty array denying everything — the
   * capability-token ACL primitive. See {@link import('./filter.js').matchesFilter}.
   */
  filter?: Record<string, unknown>;
  /**
   * Relevance floor, passed through from `RetrieveOptions.minScore`: results whose `score` is below it
   * are dropped BEFORE the top-K cut (so the K returned are all above the floor). `score` is higher-is-
   * more-relevant (cosine similarity `1 - distance`, or a negated L2/inner distance). Undefined → no
   * floor (unchanged behavior).
   */
  minScore?: number;
}

/**
 * The write + search side of RAG storage. This package ships {@link import('./memory-vector-store.js').MemoryVectorStore}
 * (in-JS cosine, tests + small/embedded corpora); a pgvector/Lucid-backed store is deferred. Pair one
 * with an {@link import('../spi/embedding-provider.js').EmbeddingProvider} via
 * {@link import('./embedding-retriever.js').EmbeddingRetriever} to get a `Retriever`.
 */
export interface VectorStore {
  upsert(records: VectorRecord[]): Promise<void>;
  search(embedding: number[], options: VectorSearchOptions): Promise<Passage[]>;
  /**
   * Delete every chunk belonging to a source document — all records whose id is `${documentId}` or
   * `${documentId}#<n>` (the id scheme {@link import('./ingest.js').chunkDocuments} produces). Use it to
   * drop a document from the index, and before re-ingesting one: `upsert` overwrites matching ids but
   * can't remove chunks a shorter new version no longer produces, so a re-ingest without a preceding
   * `remove` leaves the old tail orphaned.
   */
  remove(documentId: string): Promise<void>;
  /**
   * List the distinct source documents currently indexed (chunk ids collapsed back to their document by
   * stripping the trailing `#<n>`), each with a representative chunk's `metadata`, optionally narrowed
   * by a metadata `filter`.
   */
  listDocuments(filter?: Record<string, unknown>): Promise<IndexedDocument[]>;
}

/** A distinct source document as seen by the index — its id plus a representative chunk's metadata. */
export interface IndexedDocument {
  id: string;
  metadata?: Record<string, unknown>;
}

/** Collapse a chunk id (`${documentId}#<n>`) back to its source document id. */
export function documentIdOf(chunkId: string): string {
  return chunkId.replace(/#\d+$/, '');
}

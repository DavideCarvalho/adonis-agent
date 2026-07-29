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
  /**
   * OPTIONAL capability. Rewrite a document's metadata **without touching its text or its embeddings**.
   *
   * The update path for a dimension that is genuinely mutable — which collection a document belongs to,
   * who may see it, what it was reclassified as — rather than derived from its content. Without this the
   * only way to change one string is {@link VectorStore.upsert}, which needs the text and a fresh
   * embedding, so a consumer whose documents get re-classified has two bad options: re-embed a whole
   * document to change a label (paying the model bill for a reclassification), or refuse to stamp the
   * mutable dimension onto chunks at all and resolve it at query time — turning a filter the index could
   * have applied into a join the caller has to do. The second is what actually happens, and it is what
   * makes an actor-derived retrieval filter unaffordable: such a filter only pays off if the dimensions
   * it filters on are on the chunks AND can be corrected when they change.
   *
   * `patch` is applied to EVERY chunk of the document (metadata is a document-level property that
   * happens to be stored per chunk), with the **shallow JSON Merge Patch** semantics spelled out on
   * {@link MetadataPatch} — in those words because "patch" alone does not tell a caller whether `null`
   * deletes a key or stores a null. It deletes.
   *
   * Resolves to **the number of chunks written**. An unknown `documentId` writes nothing and returns
   * `0` rather than throwing, matching {@link VectorStore.remove}, which is likewise silent on a
   * document that is not there: this is a reconciliation-shaped call, driven by a loop diffing a source
   * of truth against the index, and such a loop races with ingestion and deletion by construction. A
   * patch with no effective keys also writes nothing and returns `0` — the count is chunks *written*,
   * not chunks *matched*.
   *
   * Optional so a host-written store still compiles; feature-detect with `store.updateMetadata?.(…)`.
   * All three stores this package ships implement it.
   */
  updateMetadata?(documentId: string, patch: MetadataPatch): Promise<number>;
}

/**
 * A metadata patch, applied by {@link VectorStore.updateMetadata}. **Shallow JSON Merge Patch**
 * (RFC 7396, restricted to one level):
 *
 * - a key with a **non-null** value **replaces** that key's value outright. Values are replaced
 *   *wholesale*, arrays and nested objects included — that is the "shallow" part: `{ tags: ['b'] }`
 *   makes `tags` exactly `['b']`, it does not append to it, and `{ acl: { read: [] } }` replaces the
 *   whole `acl` object rather than merging into it. To edit one field of a nested object, send the
 *   nested object you want.
 * - a key with the value **`null` DELETES that key**. This is the one semantic a caller cannot guess and
 *   will get wrong in the destructive direction, so: `null` removes, it does not store a JSON null.
 * - a key set to `undefined` is **ignored** — treated as absent, since JSON has no `undefined`. A patch
 *   whose every value is `undefined` therefore writes nothing.
 * - a key **not present** in the patch is left alone. That is the point: this is a partial update, not a
 *   replacement of the metadata object.
 *
 * A chunk with no metadata at all gains an object on its first patch, and metadata stays an object
 * afterwards — possibly the empty one, if every key was deleted.
 */
export type MetadataPatch = Record<string, unknown>;

/**
 * The keys of a `patch` that will actually be written — every key whose value is not `undefined`. Shared
 * by all three stores so "an empty patch writes nothing and returns 0" means the same thing on each, and
 * so none of them issues a round trip for a no-op.
 */
export function effectivePatchKeys(patch: MetadataPatch): string[] {
  return Object.keys(patch).filter((key) => patch[key] !== undefined);
}

/**
 * Apply a {@link MetadataPatch} to one chunk's metadata, returning the new metadata object. The single
 * definition of the merge, shared by every store that can do the merge in JS — so the semantics cannot
 * drift between adapters. Pure: the input object is never mutated.
 *
 * Always returns an object (never `undefined`), so a patched chunk has metadata even if it had none
 * before, and an all-deleting patch leaves `{}` rather than a hole. `{}` and absent metadata are
 * indistinguishable to {@link import('./filter.js').matchesFilter} and to pgvector's `@>`, so this costs
 * a caller nothing.
 */
export function applyMetadataPatch(
  metadata: Record<string, unknown> | undefined,
  patch: MetadataPatch,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...metadata };
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (value === undefined) {
      continue; // JSON has no `undefined`; treat it as "key not present".
    }
    if (value === null) {
      delete next[key]; // JSON Merge Patch: null REMOVES the key.
      continue;
    }
    next[key] = value; // Replaced wholesale — shallow, so no recursive merge.
  }
  return next;
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

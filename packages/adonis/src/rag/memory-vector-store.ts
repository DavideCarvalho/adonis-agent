import type { Passage } from '../spi/retriever.js';
import { matchesFilter } from './filter.js';
import {
  type IndexedDocument,
  type VectorRecord,
  type VectorSearchOptions,
  type VectorStore,
  documentIdOf,
} from './vector-store.js';

/**
 * An in-process {@link VectorStore} — cosine similarity over a Map, no infra. The reference adapter for
 * tests and small/embedded corpora; a pgvector/Lucid-backed store for production scale is deferred.
 */
export class MemoryVectorStore implements VectorStore {
  private readonly records = new Map<string, VectorRecord>();

  async upsert(records: VectorRecord[]): Promise<void> {
    for (const record of records) {
      this.records.set(record.id, record);
    }
  }

  async remove(documentId: string): Promise<void> {
    for (const id of this.records.keys()) {
      if (documentIdOf(id) === documentId) {
        this.records.delete(id);
      }
    }
  }

  async listDocuments(filter?: Record<string, unknown>): Promise<IndexedDocument[]> {
    const documents = new Map<string, IndexedDocument>();
    for (const record of this.records.values()) {
      if (filter !== undefined && !matchesFilter(record.metadata, filter)) {
        continue;
      }
      const id = documentIdOf(record.id);
      if (!documents.has(id)) {
        documents.set(id, {
          id,
          ...(record.metadata !== undefined ? { metadata: record.metadata } : {}),
        });
      }
    }
    return [...documents.values()];
  }

  async search(embedding: number[], options: VectorSearchOptions): Promise<Passage[]> {
    const scored: Passage[] = [];
    for (const record of this.records.values()) {
      if (options.filter !== undefined && !matchesFilter(record.metadata, options.filter)) {
        continue;
      }
      const score = cosineSimilarity(embedding, record.embedding);
      // Relevance floor: drop below-threshold passages before the top-K cut, so `minScore` never
      // leaves the returned K padded with weakly-related sources.
      if (options.minScore !== undefined && score < options.minScore) {
        continue;
      }
      scored.push({
        id: record.id,
        text: record.text,
        score,
        ...(record.source !== undefined ? { source: record.source } : {}),
        ...(record.metadata !== undefined ? { metadata: record.metadata } : {}),
      });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, options.topK);
  }
}

/** Cosine similarity of two vectors; `0` when either has zero magnitude. Pure. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const valueA = a[index] ?? 0;
    const valueB = b[index] ?? 0;
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

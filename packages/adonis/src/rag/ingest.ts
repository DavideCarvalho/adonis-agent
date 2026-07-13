import type { EmbeddingProvider } from '../spi/embedding-provider.js';
import { type ChunkOptions, chunkText } from './chunk.js';
import type { VectorRecord, VectorStore } from './vector-store.js';

/** A source document to ingest. `id` scopes the chunk ids (`${id}#${n}`); `source` is the citation. */
export interface IngestDocument {
  id: string;
  text: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

/** A chunked, not-yet-embedded record. */
export interface ChunkRecord {
  id: string;
  text: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface IngestChunksOptions {
  embedder: EmbeddingProvider;
  store: VectorStore;
}

export interface IngestOptions extends ChunkOptions, IngestChunksOptions {}

/**
 * Split documents into chunk records. Chunk ids are `${doc.id}#${index}`, so re-chunking the same
 * document produces the same ids (upsert overwrites in place rather than duplicating).
 */
export function chunkDocuments(
  documents: IngestDocument[],
  options: ChunkOptions = {},
): ChunkRecord[] {
  const chunks: ChunkRecord[] = [];
  for (const document of documents) {
    chunkText(document.text, options).forEach((text, index) => {
      chunks.push({
        id: `${document.id}#${index}`,
        text,
        ...(document.source !== undefined ? { source: document.source } : {}),
        ...(document.metadata !== undefined ? { metadata: document.metadata } : {}),
      });
    });
  }
  return chunks;
}

/** Embed pre-chunked records (one batched `embed`) and upsert them. Returns the record count. */
export async function ingestChunks(
  chunks: ChunkRecord[],
  options: IngestChunksOptions,
): Promise<number> {
  if (chunks.length === 0) {
    return 0;
  }
  const embeddings = await options.embedder.embed(chunks.map((chunk) => chunk.text));
  const records: VectorRecord[] = chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index] ?? [],
  }));
  await options.store.upsert(records);
  return records.length;
}

/** Chunk → embed → upsert in one call. Returns the number of chunks indexed. */
export async function ingestDocuments(
  documents: IngestDocument[],
  options: IngestOptions,
): Promise<number> {
  return ingestChunks(chunkDocuments(documents, options), options);
}

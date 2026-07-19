import { createHash } from 'node:crypto';
import type { Passage } from '../spi/retriever.js';
import { documentIdOf } from './vector-store.js';
import type {
  IndexedDocument,
  VectorRecord,
  VectorSearchOptions,
  VectorStore,
} from './vector-store.js';

/** Similaridade → nome de distância do Qdrant. Cosine (default), Dot (inner), Euclid (l2). */
export type QdrantMetric = 'cosine' | 'inner' | 'l2';
const DISTANCE: Record<QdrantMetric, string> = { cosine: 'Cosine', inner: 'Dot', l2: 'Euclid' };

export interface QdrantStoreOptions {
  /** Nome da collection. Default `agent_rag_chunks`. */
  collection?: string;
  /** Largura do embedding — deve casar com o modelo (1536 p/ text-embedding-3-small). Default 1536. */
  dimension?: number;
  /** Métrica de similaridade. Default `cosine`. */
  metric?: QdrantMetric;
}

/** Ponto do Qdrant (id UUID, vetor, payload). */
export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

/** Filtro do Qdrant (subconjunto usado). */
export interface QdrantCondition {
  key: string;
  match: { value: unknown } | { any: unknown[] } | { except: unknown[] };
}
export interface QdrantFilter {
  must?: QdrantCondition[];
}

/**
 * O subconjunto do client `@qdrant/js-client-rest` que a {@link QdrantStore} usa — estrutural, para
 * manter o pacote como peer OPCIONAL (a factory importa o client real e o passa aqui) e permitir um
 * fake nos testes. Espelha `LucidDatabaseLike` do pgvector.
 */
export interface QdrantClientLike {
  getCollections(): Promise<{ collections: { name: string }[] }>;
  createCollection(
    name: string,
    config: { vectors: { size: number; distance: string } },
  ): Promise<unknown>;
  upsert(collection: string, args: { points: QdrantPoint[] }): Promise<unknown>;
  query(
    collection: string,
    args: {
      query: number[];
      limit: number;
      with_payload: boolean;
      filter?: QdrantFilter;
      score_threshold?: number;
    },
  ): Promise<{ points: { score: number; payload?: Record<string, unknown> }[] }>;
  delete(collection: string, args: { filter: QdrantFilter }): Promise<unknown>;
  scroll(
    collection: string,
    args: {
      filter?: QdrantFilter;
      with_payload: boolean;
      with_vector: boolean;
      limit: number;
      offset?: unknown;
    },
  ): Promise<{ points: { payload?: Record<string, unknown> }[]; next_page_offset?: unknown }>;
}

/**
 * Traduz o filtro de metadata (`Record<string, unknown>`) para um {@link QdrantFilter}, preservando a
 * semântica de ACL por token: scalar = match exato; array = match-any (set membership; casa o
 * `jsonb_exists_any` do pgvector — o `any` do Qdrant testa interseção com campo scalar OU array);
 * array vazio = nega tudo (`any: []` nunca casa). Chaves miram `metadata.<k>` (o payload aninha o
 * metadata sob `metadata`). Múltiplas chaves entram em `must` (AND). Vazio/ausente → undefined.
 */
export function buildQdrantFilter(
  filter: Record<string, unknown> | undefined,
): QdrantFilter | undefined {
  if (filter === undefined || Object.keys(filter).length === 0) return undefined;
  const must: QdrantCondition[] = Object.entries(filter).map(([key, value]) => {
    const k = `metadata.${key}`;
    return Array.isArray(value)
      ? { key: k, match: { any: value } }
      : { key: k, match: { value } };
  });
  return { must };
}

/** Namespace UUID fixo da lib para derivar ids de ponto determinísticos (RFC 4122 §4.3). */
const NAMESPACE = 'b9d5a5f2-1c3e-5e7a-9b2d-6f4c8a1e0d3b';

/** UUIDv5(NAMESPACE, name) via SHA-1 — determinístico, sem dep externa. */
export function chunkIdToPointId(chunkId: string): string {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(chunkId).digest();
  const bytes = hash.subarray(0, 16);
  // readUInt8/writeUInt8 (not indexed access) so this stays clean under noUncheckedIndexedAccess.
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x50, 6); // versão 5
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8); // variante RFC 4122
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Um {@link VectorStore} sobre o Qdrant — o gêmeo do {@link import('./pg-vector-store.js').PgVectorStore}
 * para bancos de vetor gerenciados (ex.: GuaraCloud). Fala com o client via {@link QdrantClientLike}
 * estrutural (o `@qdrant/js-client-rest` fica peer opcional). Uma collection, escopo por filtro de
 * payload. O chunk id (`${documentId}#<n>`) vira UUIDv5 no ponto e volta pelo payload.
 */
export class QdrantStore implements VectorStore {
  private readonly collection: string;
  private readonly dimension: number;
  private readonly metric: QdrantMetric;

  constructor(
    private readonly client: QdrantClientLike,
    options: QdrantStoreOptions = {},
  ) {
    this.collection = options.collection ?? 'agent_rag_chunks';
    this.dimension = options.dimension ?? 1536;
    this.metric = options.metric ?? 'cosine';
  }

  /** Idempotente: cria a collection (dimensão + métrica) se ainda não existir. */
  async ensureCollection(): Promise<void> {
    const { collections } = await this.client.getCollections();
    if (collections.some((c) => c.name === this.collection)) return;
    await this.client.createCollection(this.collection, {
      vectors: { size: this.dimension, distance: DISTANCE[this.metric] },
    });
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;
    const points: QdrantPoint[] = records.map((r) => ({
      id: chunkIdToPointId(r.id),
      vector: r.embedding,
      payload: {
        id: r.id,
        documentId: documentIdOf(r.id),
        text: r.text,
        ...(r.source !== undefined ? { source: r.source } : {}),
        ...(r.metadata !== undefined ? { metadata: r.metadata } : {}),
      },
    }));
    await this.client.upsert(this.collection, { points });
  }

  async search(embedding: number[], options: VectorSearchOptions): Promise<Passage[]> {
    const filter = buildQdrantFilter(options.filter);
    const result = await this.client.query(this.collection, {
      query: embedding,
      limit: options.topK,
      with_payload: true,
      ...(filter !== undefined ? { filter } : {}),
      ...(options.minScore !== undefined ? { score_threshold: options.minScore } : {}),
    });
    return result.points.map((point) => {
      const payload = point.payload ?? {};
      const source = payload.source;
      const metadata = payload.metadata;
      return {
        id: String(payload.id),
        text: String(payload.text),
        score: point.score,
        ...(source !== undefined && source !== null ? { source: String(source) } : {}),
        ...(metadata !== undefined && metadata !== null
          ? { metadata: metadata as Record<string, unknown> }
          : {}),
      };
    });
  }
  async remove(documentId: string): Promise<void> {
    await this.client.delete(this.collection, {
      filter: { must: [{ key: 'documentId', match: { value: documentId } }] },
    });
  }

  async listDocuments(filter?: Record<string, unknown>): Promise<IndexedDocument[]> {
    const qFilter = buildQdrantFilter(filter);
    const seen = new Map<string, IndexedDocument>();
    let offset: unknown = undefined;
    // Pagina via scroll até esgotar. Corpus ~1500 chunks → poucas páginas.
    for (;;) {
      const page = await this.client.scroll(this.collection, {
        with_payload: true,
        with_vector: false,
        limit: 256,
        ...(qFilter !== undefined ? { filter: qFilter } : {}),
        ...(offset !== undefined ? { offset } : {}),
      });
      for (const point of page.points) {
        const payload = point.payload ?? {};
        const docId = payload.documentId;
        if (docId === undefined || docId === null) continue;
        const id = String(docId);
        if (seen.has(id)) continue;
        const metadata = payload.metadata;
        seen.set(id, {
          id,
          ...(metadata !== undefined && metadata !== null
            ? { metadata: metadata as Record<string, unknown> }
            : {}),
        });
      }
      if (page.next_page_offset === undefined || page.next_page_offset === null) break;
      offset = page.next_page_offset;
    }
    return [...seen.values()];
  }
}

import { describe, expect, it } from 'vitest';
import { QdrantStore, buildQdrantFilter, chunkIdToPointId } from '../src/rag/qdrant-store.js';
import type { QdrantClientLike } from '../src/rag/qdrant-store.js';

/** Recording fake — captura toda chamada e devolve respostas canned. Prova que a
 *  store fala com o Qdrant do jeito certo SEM um Qdrant vivo (espelha RecordingDb). */
class RecordingQdrantClient implements QdrantClientLike {
  calls: { method: string; args: unknown[] }[] = [];
  collections: string[] = [];
  queryResult: { points: unknown[] } = { points: [] };
  scrollResult: { points: unknown[]; next_page_offset?: unknown } = { points: [] };

  async getCollections() {
    this.calls.push({ method: 'getCollections', args: [] });
    return { collections: this.collections.map((name) => ({ name })) };
  }
  async createCollection(name: string, config: unknown) {
    this.calls.push({ method: 'createCollection', args: [name, config] });
    this.collections.push(name);
    return {};
  }
  async upsert(collection: string, args: unknown) {
    this.calls.push({ method: 'upsert', args: [collection, args] });
    return {};
  }
  async query(collection: string, args: unknown) {
    this.calls.push({ method: 'query', args: [collection, args] });
    return this.queryResult;
  }
  async delete(collection: string, args: unknown) {
    this.calls.push({ method: 'delete', args: [collection, args] });
    return {};
  }
  async scroll(collection: string, args: unknown) {
    this.calls.push({ method: 'scroll', args: [collection, args] });
    return this.scrollResult;
  }
  last(method: string) {
    const call = [...this.calls].reverse().find((c) => c.method === method);
    if (!call) throw new Error(`no ${method} recorded`);
    return call.args;
  }
}

describe('chunkIdToPointId', () => {
  it('é um UUID determinístico (mesmo id → mesmo UUID)', () => {
    const a = chunkIdToPointId('doc-1#3');
    const b = chunkIdToPointId('doc-1#3');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(chunkIdToPointId('doc-1#4')).not.toBe(a);
  });
});

describe('QdrantStore.ensureCollection', () => {
  it('cria a collection com dimensão e métrica quando ausente', async () => {
    const client = new RecordingQdrantClient();
    const store = new QdrantStore(client, { collection: 'rag', dimension: 8, metric: 'cosine' });
    await store.ensureCollection();
    const [name, config] = client.last('createCollection');
    expect(name).toBe('rag');
    expect(config).toEqual({ vectors: { size: 8, distance: 'Cosine' } });
  });

  it('é no-op quando a collection já existe', async () => {
    const client = new RecordingQdrantClient();
    client.collections = ['rag'];
    const store = new QdrantStore(client, { collection: 'rag', dimension: 8 });
    await store.ensureCollection();
    expect(client.calls.some((c) => c.method === 'createCollection')).toBe(false);
  });
});

describe('QdrantStore.upsert', () => {
  it('mapeia records para pontos com id UUIDv5, vetor e payload', async () => {
    const client = new RecordingQdrantClient();
    const store = new QdrantStore(client, { collection: 'rag', dimension: 3 });
    await store.upsert([
      {
        id: 'doc-1#0',
        text: 'olá',
        embedding: [0.1, 0.2, 0.3],
        source: 'Fonte A',
        metadata: { page: 2 },
      },
    ]);
    const [collection, args] = client.last('upsert') as [string, { points: any[] }];
    expect(collection).toBe('rag');
    const p = args.points[0];
    expect(p.id).toBe(chunkIdToPointId('doc-1#0'));
    expect(p.vector).toEqual([0.1, 0.2, 0.3]);
    expect(p.payload).toEqual({
      id: 'doc-1#0',
      documentId: 'doc-1',
      text: 'olá',
      source: 'Fonte A',
      metadata: { page: 2 },
    });
  });
});

describe('buildQdrantFilter', () => {
  it('scalar → match value; array → match any; múltiplas chaves → must', () => {
    expect(buildQdrantFilter({ tenant: 't1', audience: ['public', 'role:ADMIN'] })).toEqual({
      must: [
        { key: 'metadata.tenant', match: { value: 't1' } },
        { key: 'metadata.audience', match: { any: ['public', 'role:ADMIN'] } },
      ],
    });
  });
  it('array vazio → condição que nega tudo', () => {
    // `match.except` com o próprio universo é impraticável; usamos `any: []`, que nunca casa.
    expect(buildQdrantFilter({ audience: [] })).toEqual({
      must: [{ key: 'metadata.audience', match: { any: [] } }],
    });
  });
  it('filtro vazio/ausente → undefined', () => {
    expect(buildQdrantFilter(undefined)).toBeUndefined();
    expect(buildQdrantFilter({})).toBeUndefined();
  });
});

describe('QdrantStore.search', () => {
  it('passa limit/score_threshold/filter e mapeia pontos para Passage (id do payload)', async () => {
    const client = new RecordingQdrantClient();
    client.queryResult = {
      points: [
        { score: 0.71, payload: { id: 'doc-1#2', documentId: 'doc-1', text: 'trecho', source: 'Fonte A', metadata: { page: 5 } } },
      ],
    };
    const store = new QdrantStore(client, { collection: 'rag', dimension: 3 });
    const passages = await store.search([0.1, 0.2, 0.3], { topK: 8, minScore: 0.4, filter: { tenant: 't1' } });

    const [collection, args] = client.last('query') as [string, any];
    expect(collection).toBe('rag');
    expect(args.query).toEqual([0.1, 0.2, 0.3]);
    expect(args.limit).toBe(8);
    expect(args.score_threshold).toBe(0.4);
    expect(args.with_payload).toBe(true);
    expect(args.filter).toEqual({ must: [{ key: 'metadata.tenant', match: { value: 't1' } }] });

    expect(passages).toEqual([
      { id: 'doc-1#2', text: 'trecho', score: 0.71, source: 'Fonte A', metadata: { page: 5 } },
    ]);
  });

  it('sem filtro/minScore não envia esses campos', async () => {
    const client = new RecordingQdrantClient();
    const store = new QdrantStore(client, { collection: 'rag', dimension: 3 });
    await store.search([0, 0, 0], { topK: 5 });
    const [, args] = client.last('query') as [string, any];
    expect('filter' in args).toBe(false);
    expect('score_threshold' in args).toBe(false);
    expect(args.limit).toBe(5);
  });
});

describe('QdrantStore.remove', () => {
  it('deleta por filtro em documentId', async () => {
    const client = new RecordingQdrantClient();
    const store = new QdrantStore(client, { collection: 'rag', dimension: 3 });
    await store.remove('doc-1');
    const [collection, args] = client.last('delete') as [string, any];
    expect(collection).toBe('rag');
    expect(args.filter).toEqual({ must: [{ key: 'documentId', match: { value: 'doc-1' } }] });
  });
});

describe('QdrantStore.listDocuments', () => {
  it('faz scroll, dedupa por documentId e traz metadata representativo', async () => {
    const client = new RecordingQdrantClient();
    client.scrollResult = {
      points: [
        { payload: { documentId: 'doc-1', metadata: { title: 'A' } } },
        { payload: { documentId: 'doc-1', metadata: { title: 'A' } } },
        { payload: { documentId: 'doc-2', metadata: { title: 'B' } } },
      ],
      next_page_offset: undefined,
    };
    const store = new QdrantStore(client, { collection: 'rag', dimension: 3 });
    const docs = await store.listDocuments();
    expect(docs).toEqual([
      { id: 'doc-1', metadata: { title: 'A' } },
      { id: 'doc-2', metadata: { title: 'B' } },
    ]);
    const [, args] = client.last('scroll') as [string, any];
    expect(args.with_payload).toBe(true);
    expect(args.with_vector).toBe(false);
  });
});

---
'@adonis-agora/agent': minor
---

Adiciona um backend Qdrant (`QdrantStore implements VectorStore`) ao lado do pgvector, com a factory `retrievers.qdrant({ embedder, url, apiKey, collection, dimension, metric })`. O `@qdrant/js-client-rest` é peer dependency opcional (import lazy). Contratos `Passage`/`VectorStore` inalterados; uma collection só com filtro de payload (a mesma semântica de ACL por token do pgvector), id de chunk mapeado para UUIDv5 no ponto.

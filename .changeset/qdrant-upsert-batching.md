---
'@adonis-agora/agent': minor
---

`QdrantStore.upsert` agora fatia os pontos em lotes (novo `upsertBatchSize`, default 100) em vez de um único request. Fontes grandes viram muitos chunks (ex.: PDF de ~200 páginas → ~700 pontos); enviar tudo num request só estourava o timeout default de 300s do `@qdrant/js-client-rest` (`QdrantClientTimeoutError: This operation was aborted`). Batchar mantém cada request pequeno e previsível — ingestão robusta pra qualquer tamanho de fonte.

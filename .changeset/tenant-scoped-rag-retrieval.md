---
'@adonis-agora/agent': minor
---

**Security-relevant feature**: inject-mode RAG retrieval can now be scoped per actor via the new `retrievalFilter` config option — and **without it, retrieval remains unscoped**.

Inject-mode RAG (setting `retriever` in `config/agent.ts`) retrieves passages for the user's message and folds them into the system prompt on every turn, but had no seam through which a host could supply a filter: `retriever.retrieve(text, { topK })` was called with no `filter` and no actor, so a host could not scope it even by wrapping the retriever. Any deployment that turns on `retriever` and shares one corpus across tenants was leaking passages across tenants into the system prompt, on every turn, for every user — the write side (`rag-media` ingestion tagging `tenantRef`/`ownerId`) and the store-level `filter` support (`pgvector`/Qdrant, both correct) already existed; nothing ever populated `filter`.

`retrievalFilter?: (actor: Actor) => Record<string, unknown>` closes that gap: it derives the same `audience`-style ACL filter documented for manual/agentic retrieval, but from the run's actor, and applies it automatically inside the existing `hooks.step('retrieve', …)` (so durable replay determinism is unaffected). With no hook configured, the retriever receives options with no `filter` key at all (not `filter: undefined`) — existing single-tenant deployments are byte-identical. A hook that throws fails the turn rather than falling back to unfiltered retrieval.

**Action for existing multi-tenant deployments using inject mode**: set `retrievalFilter` in `config/agent.ts`. Without it, you may have been retrieving across your entire corpus regardless of who is asking. See `docs/retrieval/rag.mdx`.

Deliberately out of scope: the `Retriever` SPI is unchanged (third-party retrievers still satisfy it unmodified), and retrieved passages are still folded into the system prompt without fencing as untrusted data — the second half of this finding, tracked separately.

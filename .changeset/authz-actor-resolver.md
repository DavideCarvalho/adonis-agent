---
'@adonis-agora/agent': minor
---

Add `authzActorResolver` (exported from `@adonis-agora/agent/authz`) — resolve the agent `Actor` from the Agora context populated by authkit (`userRef`, `tenantId`) plus authz `effectiveRoles` (the union global ∪ app ∪ store). Structural, zero hard dependency; authkit+authz apps can drop hand-written actor resolvers. Fail-closed: no identity in context → 401.

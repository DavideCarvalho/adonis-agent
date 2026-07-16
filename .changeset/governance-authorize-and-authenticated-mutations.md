---
"@adonis-agora/agent": minor
---

Authenticate the mutation/lifecycle routes and gate the cross-actor governance read-model

Closes a privilege gap surfaced the first time the routes were mounted behind a real app's
auth. Previously several `/agent/*` routes were reachable without resolving an actor, and the
`/agent/governance/*` read-model was readable by any authenticated caller regardless of role.

- **Every `/agent/*` route now resolves the actor (401 on failure).** `chat/:runId/stream`,
  `chat/:runId/cancel`, `tool-call/approve`, `tool-call/reject`, `threads/personas/catalog`,
  `threads/:id` (GET/DELETE), and `threads/:id/fork-from/:messageId` previously ran with no
  actor resolution — an anonymous same-origin request could re-attach a run's token stream,
  cancel a run, or deliver a HITL approve/reject decision. They now go through the same resolver
  (and 401) as `chat`/`threads`/`quota`. The stream route authenticates via the request's
  session/cookies, so an `EventSource` re-attach still works. Apps that configured an
  `actorResolver` (the norm) are unaffected on legitimate calls; an app with no resolver now
  correctly 401s these routes instead of serving them anonymously.

- **New `governanceAuthorize?: (actor, ctx) => boolean | Promise<boolean>` config option.** When
  set, each `/agent/governance/*` route runs it after resolving the actor and replies `403` on
  deny (fail-closed if it throws) — so the platform-wide spend/usage/threads/approvals read-model
  can be restricted (typically ADMIN-only). Omitted, governance stays readable by any resolved
  actor (the historical behavior). Mirrors `@adonis-agora/agent-dashboard`'s `authorize` hook so
  the JSON routes and the console SPA can be gated with the same predicate. Exposed as
  `evaluateGovernanceGate` (a router-free, unit-tested helper) and the `AgentGovernanceAuthorize`
  / `GovernanceGateVerdict` types.

- **New `GET /agent/approvals/mine` route.** Returns the calling actor's OWN pending HITL
  approvals (`pendingApprovals({ actor })`, filtered by the owning run's `actor_ref`). It is
  mounted with the governance read-model but is NOT behind `governanceAuthorize`, so a non-admin
  surface (e.g. a coordinator's chat) can poll its own suspended tool calls even while the
  cross-actor `governance/approvals/pending` inbox is ADMIN-only.

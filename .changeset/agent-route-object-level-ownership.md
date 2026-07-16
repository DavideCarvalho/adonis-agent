---
"@adonis-agora/agent": minor
---

Owner-scope the per-actor run/thread routes (object-level authorization)

Follows up `0.5.0` (which authenticated these routes) by adding the ownership check: authentication
alone let any authenticated caller act on ANOTHER actor's run/thread by id. Now a caller may act only
on runs/threads it OWNS, unless it is governance-privileged.

- **Run routes** — `GET /agent/chat/:runId/stream`, `POST /agent/chat/:runId/cancel`,
  `POST /agent/tool-call/approve`, `POST /agent/tool-call/reject` — now assert the resolved actor owns
  the run (the run's `actor_ref`, recorded as the loop's first step). A non-owner gets `403`; an
  unknown run gets `404` (so an id the caller doesn't own is never confirmed).
- **Thread routes** — `GET /agent/threads/:id`, `DELETE /agent/threads/:id`,
  `POST /agent/threads/:id/fork-from/:messageId`, and `POST /agent/chat` when it continues an existing
  thread (`body.threadId`) — now assert the actor owns the thread. The chat case is the important one:
  without it an authenticated caller could pass another actor's `threadId` to load that thread's full
  history into the model (and read it back over SSE) and append its own turn into the victim's thread.
- **Cross-actor override.** A caller that passes `governanceAuthorize` (the app's "may act across
  actors" seam, typically an ADMIN check) may act on any run/thread. With no `governanceAuthorize`
  configured, ownership is strict — no cross-actor access.

New `AgentStore` SPI methods back the checks: **`getRunActorRef(runId)`** and
**`getThreadActorRef(threadId)`** (both return the owning `actor_ref` or `null`), implemented on the
Lucid and in-memory stores. A custom `AgentStore` implementation must add them. Also exposes the
router-free `evaluateOwnership` helper and the `OwnershipVerdict` type, and `AgentService.runOwner` /
`AgentService.threadOwner` passthroughs.

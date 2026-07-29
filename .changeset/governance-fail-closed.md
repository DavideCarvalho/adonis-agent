---
'@adonis-agora/agent': minor
---

**Security fix**: the cross-actor `/agent/governance/*` read-model is no longer mounted when no `governanceAuthorize` gate is configured.

Previously these routes mounted whenever the governance read-model resolved — which happens **by default** whenever the main store is Lucid — and the `governanceAuthorize` gate was optional. With no gate, the gate evaluated to "allow", so **every authenticated actor could read the platform-wide governance data: every actor's spend, token usage, thread activity, run traces and pending HITL approvals.** Apps that never configured a gate got this by taking the default; the library only printed a boot warning, which is not a control. If your app has ordinary end users (not just trusted staff) as resolved actors, assume this data was readable by any of them.

The cross-actor routes now mount **only when `governanceAuthorize` is set**. Without a gate they do not exist and return `404`. Affected routes:

`GET /agent/governance/spend/model`, `spend/actor`, `usage/trend`, `tool-calls/recent`, `threads/recent`, `runs`, `runs/:id`, `approvals/pending`, `tools/stats`, `reliability`.

**`GET /agent/approvals/mine` is unaffected.** It keeps mounting whenever the governance read-model resolves, gate or no gate — it is always scoped to the calling actor's own pending approvals, and non-admin surfaces (e.g. a chat page polling for its own suspended tool calls) depend on it.

Two migration paths, both in `config/agent.ts`:

```ts
// 1. The intended fix — mount the routes gated (typically an ADMIN check):
governanceAuthorize: (actor) => actor.roles?.includes('ADMIN') ?? false,

// 2. Deliberately keep the old open behaviour — explicit, greppable, reviewable:
governanceAuthorize: () => true,
```

Boot still succeeds without a gate: the provider warns (it does not throw) and names both paths.

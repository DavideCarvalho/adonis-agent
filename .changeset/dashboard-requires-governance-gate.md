---
'@adonis-agora/agent-dashboard': minor
'@adonis-agora/agent': patch
---

**If your governance console suddenly 404s, or every panel in it is failing: set `governanceAuthorize` in `config/agent.ts`.**

```ts
// config/agent.ts
export default defineConfig({
  // ...
  governanceAuthorize: (actor) => actor.roles?.includes('ADMIN') ?? false,
})
```

That one line brings both the console and its data back. If you deliberately want the old behaviour where any authenticated actor could read the platform-wide governance data, say so explicitly with `governanceAuthorize: () => true` — same effect, but greppable and reviewable.

**Why.** The cross-actor `/agent/governance/*` read routes stopped mounting without a `governanceAuthorize` gate (see the previous `@adonis-agora/agent` release). Ten of the console's eleven read endpoints are those routes, and the SPA calls them **from the browser** — so an app with the dashboard installed and no gate got a console that loaded fine and then failed on every panel except Quota, with nothing in the logs explaining it.

**What changed.** `@adonis-agora/agent-dashboard` now refuses to mount when the agent config has no `governanceAuthorize`, and logs a boot warning naming both fixes above. The console URL returns `404` instead of serving a shell that cannot work. Nothing that still worked is broken by this: every affected app already had a console dead in six of its seven views.

Unaffected:

- Apps that already set `governanceAuthorize` — no change whatsoever.
- `dashboard: { enabled: false }` — still off, still silent, no warning.
- `dashboard.authorize` — still an optional EXTRA gate on the SPA shell, unchanged. It is deliberately not what decides whether the console mounts: it gates the shell, not the data, so an app could set it and still have a console with nothing to render.
- `GET /agent/approvals/mine` — never behind the governance gate; still mounted and still scoped to the calling actor.

The `@adonis-agora/agent` half of this release is documentation only: the `governanceAuthorize` JSDoc and the `governance-gate.ts` comments still described the old open-by-default behaviour they no longer have. `evaluateGovernanceGate`'s behaviour is unchanged.

---
"@adonis-agora/agent-dashboard": minor
---

Add an optional `authorize` gate to the dashboard config

The console serves the governance read-model, which spans EVERY actor's spend and
usage — so authenticating the caller (the default gate, shared with
`/agent/governance/*`) is often not enough; you want to restrict it to admins.

`config('agent').dashboard.authorize` is an optional `(actor, ctx) => boolean |
Promise<boolean>` run after the actor resolves. Return `false` (or throw) to deny
— the request gets `403`. Omit it to keep the previous behavior (any resolved
actor allowed). Typical use: `authorize: (actor) => actor.roles?.includes('ADMIN')
?? false`. The gate decision lives in a router-free `evaluateDashboardGate` helper
so it is unit tested directly.

---
'@adonis-agora/agent': patch
---

**Security fix**: `agent`-kind delegate tool calls now go through the same role/ability check and allow-list filter as every other tool call, instead of executing unconditionally.

Previously, when the model emitted a tool call for an `agent`-kind (delegation) tool, the loop called `hooks.runAgent` directly at the loop level — it never went through `ToolRegistry.invoke`, so the `policy.can(actor, spec)` re-check, the Zod input validation, and the persona/agent allow-list filter (only applied when building the offered-tools set) were all skipped. A model steered by injected content — delegate tool names are advertised in sibling delegate descriptions — could name a delegate tool it was never offered and run it regardless of the actor's role or the agent's configured allow-list. The synthesized delegate specs carry no `roles` and no `ability`, so they were meant to be unreachable by a non-privileged actor; the loop ran them anyway.

The delegation branch now: (1) fails closed if the delegate's spec cannot be resolved; (2) verifies the tool name is in the set actually offered to the model (the same persona/agent allow-list intersection used to build the offer); (3) re-checks `rolesPolicy.can(actor, spec)`. All three checks run *before* the tool call is persisted and before the `agent.delegated` event is published, so a denied delegation is recorded `failed` — never `auto_executed`, even transiently.

**Behaviour change for hosts using `AuthzToolAuthorizer`**: delegate tools carry no `ability` by design. Under an authz posture, a tool with no `ability` is *always* denied — so after this fix, delegation will be denied for any actor unless the host explicitly declares an `ability` on its delegate tools. This is not a regression: it is what an authz-backed configuration with no `ability` on these tools always meant. Hosts that rely on delegation under `AuthzToolAuthorizer` need to declare an `ability` for their delegate tools (or otherwise grant it through their policy) to keep delegation working.

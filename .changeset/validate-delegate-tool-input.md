---
'@adonis-agora/agent': patch
---

Delegation now applies the input-schema gate, closing the last of the three gates `ToolRegistry.invoke` applies.

`invoke` gates every tool call on (1) the role/ability check, (2) input validation against `spec.inputSchema`, then (3) execution. `agent`-kind (delegate) calls are handled at the loop level and deliberately bypass `invoke` — the durable runner maps them to `ctx.child`, a ctx-level suspend point. The previous fix re-applied the role and allow-list gates to that branch but not the input gate, so a malformed delegate input was silently coerced instead of rejected: `extractTask` fell back to `JSON.stringify(input)`, and a model emitting `{ task: { nested: 1 } }` or `{ tsak: '...' }` delegated a JSON blob as the task string. Every other tool kind rejects that with `ToolInputInvalidError`.

The delegation branch now validates `call.input` against the delegate spec's `inputSchema` and throws the same `ToolInputInvalidError`, after the role and allow-list checks so the ordering matches `invoke` (authorization first, then shape). The task handed to the target agent is derived from the validated value rather than the raw input. A rejected input lands in the existing `try/catch`, so it is recorded `failed` and never emits `agent.delegated`.

This only rejects inputs that were previously mis-coerced; no public signature changes.

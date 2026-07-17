---
'@adonis-agora/agent': patch
---

Fix agent tool-loop dropping tool results. `mapMessages` in the AI SDK adapter skipped `toolResults` on `role: 'user'` messages (early `continue`), but `agent-loop` feeds tool output back as a synthetic `{ role: 'user', content: '', toolResults }` carrier — so the results were silently dropped and the follow-up model call threw `AI_MissingToolResultsError`. The user branch now emits the `tool` result message (via a shared `pushToolResults` helper) and skips the empty user turn so the tool result stays adjacent to the assistant tool-call. Multi-step tool-calling now completes for OpenAI-compatible providers.

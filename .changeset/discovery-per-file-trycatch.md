---
"@adonis-agora/agent": patch
---

Tool discovery no longer aborts the whole scan when one tool file fails to import.

The `app/agent_tools` readdir scan imported each file with no per-file guard, so a single tool whose module throws at import time (e.g. a top-level `@adonisjs/*/services/*` singleton resolving `app` as `undefined` during boot) took down the entire scan and left the agent with ZERO tools — which surfaces as the model "narrating" tool calls as text (it was never given any tools) rather than any visible error. Each import is now wrapped: a failing file is logged loudly (`app.logger`, else `console.error`) and skipped, so the other tools still register and the failure is diagnosable.

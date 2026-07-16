---
"@adonis-agora/agent-dashboard": patch
---

Widen the `@adonis-agora/agent` peer range to `>=0.4.0 <1.0.0`

The dashboard only consumes the agent's stable HTTP routes and public types, which are
compatible across the agent's pre-1.0 minor releases — so pinning the peer to `^0.4.0`
(i.e. `>=0.4.0 <0.5.0`) was too tight: every agent minor pushed the installed agent out
of range, producing a spurious peer warning in consumers and forcing an unwarranted major
bump of the dashboard. The range now tolerates any `0.x` agent from `0.4.0` up, and will
intentionally require a re-check at the agent's eventual `1.0.0`.

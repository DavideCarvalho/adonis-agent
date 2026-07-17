---
"@adonis-agora/agent": patch
---

Internal: simplify `readAiToolMeta` metadata resolution

Refactor the tool-metadata lookup so the two authoring mechanisms (`@AiTool`
decorator and `static tool`) and the two subjects (the value, its constructor)
are composed explicitly — `metaOn(target) ?? metaOn(ctor)` — instead of a flat
four-way fallback chain. No behavior or API change; discovery of both forms is
unchanged (mutation-proven).

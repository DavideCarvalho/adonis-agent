---
'@adonis-agora/agent': minor
---

Novo `BaseTool` (classe base opcional para a forma de classe de um tool) — o análogo do `BaseWorkflow` do durable. Declarar `static tool = { … }` numa subclasse de `BaseTool` é type-checado pela estática herdada (`static tool?: AiToolOptions`), sem precisar de `satisfies AiToolOptions`. `ToolHandler<I, O = unknown>` e `defineTool<I, O>` passam a tipar o retorno do `execute` (antes `Promise<unknown>`), então o compilador confere o corpo contra o que o tool promete. Ambos non-breaking (defaults preservam o comportamento anterior).

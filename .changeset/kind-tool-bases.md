---
'@adonis-agora/agent': minor
---

Novas bases kind-específicas `ReadTool` e `ActionTool` (além do `BaseTool`): fixam o `kind` no base, então a subclasse escreve `static tool = { name, description, input, ability }` **truly bare** — sem `satisfies AiToolOptions` e sem a anotação `: AiToolOptions`. Antes o `kind: 'read' | 'action'` do `BaseTool`/`AiToolOptions` forçava um dos dois (a estática herdada não dá contextual-typing, então o literal alargaria `kind` para `string`). A descoberta lê o `kind` da estática do base. Exporta também `BaseToolOptions` (= `Omit<AiToolOptions, 'kind'>`).

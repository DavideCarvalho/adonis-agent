---
'@adonis-agora/agent': minor
---

Suporta `@adonis-agora/durable` 0.8.x (o peer passa de `^0.7.0` para `^0.8.0`).

O durable 0.8.0 removeu o decorator `@Workflow`, que o `AgentRunWorkflow` usava, em favor de
`BaseWorkflow` + `static workflow = { name, version }`. Instalar agent 0.1.0 ao lado de durable
0.8.0 derrubava o modo durable inteiro — `TypeError: (0 , Workflow) is not a function` ao carregar
o módulo, com o provider caindo silenciosamente no runner inline. O `^0.7.0` barrava a combinação,
então ninguém instalou os dois juntos; o preço era ficar preso ao durable 0.7.

O `AgentRunWorkflow` agora estende `BaseWorkflow` e declara `static workflow`. O resto da
integração (`WorkflowEngine.start/signal/cancel`, `registerWorkflowClass`, `WorkflowSuspended`,
`ContinueAsNew`, `WorkflowCtx`) não mudou.

O bug nasceu de um vão de teste: o `durable` não era devDependency, então o lockfile resolvia
0.7.0 e a suíte exercitava o runner durable contra a versão antiga — verde e cega para o 0.8.0.
Agora é devDependency em `^0.8.0`, e os testes rodam contra a mesma versão que o peer promete.

---
'@adonis-agora/agent': minor
---

Tools de classe agora são instanciados pelo **container do Adonis**, então `@inject` no construtor funciona — o app deixa de fazer service-locator (`app.container.make(...)`) dentro do `execute()`.

```ts
@inject()
export default class ReatribuirPesquisa extends ActionTool<Input, Result> {
  constructor(private allocation: CoordinatorAllocationService) {
    super()
  }
  static tool = { name: 'reatribuir_pesquisa', description: '…', input, ability }
  async execute(input, ctx) {
    return this.allocation.reassign({ ...input, coordinatorId: ctx.actor.id })
  }
}
```

A resolução é **lazy** (no primeiro `execute`) e cacheada: a descoberta roda no `boot()` do provider, antes do app estar totalmente booted, então um `container.make()` eager poderia falhar resolvendo um peer service — o mesmo motivo pelo qual a store factory do Lucid resolve lazy. Tools sem dependências continuam funcionando iguais.

`discoverTools`, `registerToolsFromBarrel` e `registerToolExport` aceitam um `app?: ApplicationService` opcional (o provider passa `this.app`); sem ele, o comportamento pré-DI (`new Ctor()`) é preservado. `registerToolExport` continua síncrono.

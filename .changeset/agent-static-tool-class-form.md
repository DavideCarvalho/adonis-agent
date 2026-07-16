---
"@adonis-agora/agent": minor
---

Add a decorator-free `static tool` authoring form for class tools

A tool class can now declare its metadata with a `static tool = { name, kind, description, input, … }`
config instead of the `@AiTool({ … })` decorator — the same shape, mirroring
`@adonis-agora/durable`'s `static workflow`. Discovery, registration, and execution are identical;
`readAiToolMeta` now reads the static config when no decorator is present.

```ts
import type { AiToolCtx, AiToolOptions, ToolHandler } from '@adonis-agora/agent'
import { z } from 'zod'

export default class GetWeather implements ToolHandler<{ city: string }> {
  static tool = {
    name: 'getWeather',
    kind: 'read',
    description: 'Get the weather',
    input: z.object({ city: z.string() }),
  } satisfies AiToolOptions

  async execute(input: { city: string }, ctx: AiToolCtx) {
    return { tempC: 21 }
  }
}
```

The `@AiTool` decorator and the functional `defineTool(...)` forms are unchanged.

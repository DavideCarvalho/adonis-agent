---
"@adonis-agora/agent": patch
---

Fix `tokenSinks.redis()` crashing at boot with "Cannot read properties of undefined (reading 'booted')".

The Redis sink factory built its client by importing `@adonisjs/redis/services/main`, whose module-level `app` is `undefined` when the sink is resolved during `AgentProvider.boot` — so the sink threw at boot and, under `durable: true`, the first frame write hung (runs stuck at step 0). The sink factory now receives the app context (like store/quota factories) and resolves Redis via `app.container.make('redis')` with the live application, so it builds correctly. `SinkFactory` / `TokenSinkFactory` now take a `{ app }` context argument (a no-arg factory stays assignable, so existing custom sink factories keep working).

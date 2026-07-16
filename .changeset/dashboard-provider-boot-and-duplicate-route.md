---
"@adonis-agora/agent-dashboard": patch
---

Fix the dashboard provider crashing every app boot (and a duplicate-route crash)

Two bugs that made the provider unbootable in a real app — surfaced the first time
it was registered in one (entre-textos):

- **`router` was `undefined` at boot.** The provider imported `router` from
  `@adonisjs/core/services/router` and called `router.get(...)` in `boot()`. That
  service's default export is only assigned inside an `app.booted()` hook, which
  runs AFTER every provider's `boot()`, so it was still `undefined` — `router.get`
  threw `Cannot read properties of undefined (reading 'get')` and crashed the whole
  app. It now resolves the router from the container (`app.container.make('router')`),
  available during boot, mirroring how the agent provider registers its routes.

- **Duplicate `GET <mount>` route.** The provider registered a bare-mount redirect
  (`<mount>` → `<mount>/`) plus the shell at `<mount>/`. The AdonisJS router
  normalizes trailing slashes, so both are the SAME pattern — the second
  registration threw `Duplicate route found`. The shell now serves at the bare
  `<mount>` (one route), and `sendIndex` injects a `<base href="<mount>/">` so the
  SPA's relative `./assets/*` URLs (Vite `base: './'`) still resolve against the
  mount directory regardless of the URL's trailing slash.

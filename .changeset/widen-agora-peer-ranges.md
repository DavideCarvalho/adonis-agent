---
'@adonis-agora/agent': patch
---

The optional `@adonis-agora/*` peer ranges (`authz`, `diagnostics`, `durable`, `telescope`) no longer point at a single already-superseded minor. On a `0.x` package `^0.x.y` means "this exact minor only," so every sibling minor bump silently made these ranges unsatisfiable against what's published on npm — a consumer installing any current sibling version got an `ERESOLVE`/warning wall. Ranges now use `>=<floor> <1.0.0`, matching the pattern already used by `agent-dashboard`'s peer on `agent` and `authz-react`'s peer on `authz`. The floor for each is the version this package was actually verified against (the one the dev install had resolved), not the current published version:

- `@adonis-agora/authz`: `>=0.4.2 <1.0.0`
- `@adonis-agora/diagnostics`: `>=0.1.0 <1.0.0`
- `@adonis-agora/durable`: `>=0.8.0 <1.0.0`
- `@adonis-agora/telescope`: `>=0.4.0 <1.0.0`

The matching devDependencies were bumped to the current published versions (durable 0.20.0, telescope 0.6.0, authz 0.10.1, diagnostics 0.2.5) so this repo's typecheck and test suite actually run against current sibling APIs instead of many minors behind. No source changes were required — the integration code under `durable/`, `telescope/`, `authz/` and `diagnostics.ts` typechecked and passed its tests unchanged against the newer siblings.

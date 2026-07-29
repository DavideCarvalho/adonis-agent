---
'@adonis-agora/agent': patch
---

`node ace add @adonis-agora/agent` now actually registers the provider and publishes the config and migration stubs, instead of silently warning "the module does not export the configure hook" and doing nothing. AdonisJS resolves the configure hook by importing the package's main entry and reading `configure` off the module namespace — it never reads the `./configure` subpath. The package main now re-exports `configure` from the package root so `node ace configure` finds it.

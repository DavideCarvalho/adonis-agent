---
'@adonis-agora/agent': patch
---

Type the MCP actor on `AuthInfo.extra`: the `authKitAuth()`/`apiKeyAuth()` strategies now return a typed `McpAuthInfo` (`extra: { actor: Actor }`), and `actorFromAuthInfo`/`isActor` are exported from `@adonis-agora/agent/mcp` so consumers no longer hand-roll a runtime guard. The MCP provider reuses the promoted helpers instead of its module-local copies.

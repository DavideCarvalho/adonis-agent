---
'@adonis-agora/agent': minor
---

Add an MCP (Model Context Protocol) endpoint that exposes the agent's ToolRegistry over Streamable
HTTP.

- New `./mcp` subpath: `defineMcpConfig`, `createMcpServer`, and two auth strategies — `authKitAuth()`
  (OAuth OIDC via `@adonis-agora/authkit-server`, resolved lazily) and `apiKeyAuth()` (constant-time
  key compare). The acting `Actor` resolves from the verified auth and gates `tools/list` /
  `tools/call` through the same role-checked registry the agent loop uses (fail-closed).
- New `./mcp_provider` subpath: an Adonis provider that mounts `POST|GET|DELETE /mcp` plus
  `GET /.well-known/oauth-protected-resource/mcp` (RFC 9728 metadata when OAuth is configured), with
  per-session Streamable HTTP transports.
- `configure` publishes `config/mcp.ts` via the new `config/mcp.stub`.

The published `dist` ships `./mcp` and `./mcp_provider` export maps (mirroring `./agent_provider`).

---
"@adonis-agora/agent": minor
---

Add a framework-agnostic browser client and a React hook for the chat SSE endpoints.

Consuming the agent's SSE envelope (`POST /agent/chat` → `event: meta` / `data: {delta}` / `event: component` / `event: done`) and reconnecting a dropped stream used to be re-implemented by hand in every app. Two new entry points move that logic into the package, next to the server that emits the envelope:

- **`@adonis-agora/agent/client`** — zero-dependency, isomorphic. `createAgentChatClient({ basePath, fetch, getHeaders, resume })` returns `send()` / `resume()` that post a turn, parse the envelope, capture the run id, and — when the connection drops before `done` — re-attach to `GET /agent/chat/:runId/stream` (which replays the whole stream from the start and follows live) with backoff, until the run finishes or the retry budget is exhausted. The run is durable and keeps executing server-side across the drop, so no tokens are lost. Also exports the parsing primitives (`parseSseEvent`, `decodeFrame`, `foldPart`, `readSseStream`) and `AgentChatDisconnectedError` (which carries the partial parts).
- **`@adonis-agora/agent/react`** — `useAgentChat({ ...clientOptions, buildBody })` returning `{ messages, status, error, send, cancel }`, a thin state wrapper over the client. `react` is a new optional peer dependency.

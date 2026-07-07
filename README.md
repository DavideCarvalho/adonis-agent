# @adonis-agora/agent

Governed, durable-backed AI agent (chat + tool-calling + governance) for AdonisJS — part of the
[Agora](https://github.com/DavideCarvalho) ecosystem.

> **Status: Wave 1 — framework-agnostic core.** This package currently ships the provider-agnostic
> agent runtime only: the agent loop, the SPIs (model / store / quota / roles / sink / runner /
> governance), the tool registry, personas/agent registries, the Vercel AI SDK adapter, and
> in-memory testing doubles. The AdonisJS provider, HTTP routes, and Lucid store land in Wave 2.

## Install

```sh
pnpm add @adonis-agora/agent
```

## Entry points

| Import                        | What it exposes                                                        |
| ----------------------------- | --------------------------------------------------------------------- |
| `@adonis-agora/agent`         | `runAgentLoop`, SPIs, `ToolRegistry`, `AgentRegistry`, personas, types |
| `@adonis-agora/agent/ai-sdk`  | `aiSdkModel` — adapts a Vercel AI SDK v7 `LanguageModel` to `ModelProvider` |
| `@adonis-agora/agent/testing` | `FakeModelProvider`, in-memory store / sink / quota / governance doubles |
| `@adonis-agora/agent/types`   | The public type surface                                               |

## The agent loop

`runAgentLoop(deps, input, hooks)` drives one provider-agnostic agent turn (model → tools → model).
The `hooks` seam (`step` / `awaitApproval` / `openSink` / `runAgent`) lets the same loop body run
either in-process or as a replay-safe durable workflow. `read` tools auto-execute, `action` tools
gate on human approval, and `agent` tools delegate to another named agent.

## License

MIT

---
"@adonis-agora/agent": patch
---

Fix `app/agent_tools` discovery registering nothing in a dev/TypeScript app

The `app/agent_tools` scanner picked which module extension to import from
`extname(import.meta.url)` — the extension of the SCANNER's own file. Since the
package ships compiled (`.js`), that was always `.js`, so an app running from
TypeScript source under a loader (`app/agent_tools/*.ts`, no build barrel wired)
had its directory scanned for `.js` files, matched none, and registered zero
tools — the agent silently ran with an empty `ToolRegistry`.

The extension is now derived from what the scanned directory actually holds
(`.ts` when it has any non-declaration `.ts` file, else `.js`). At runtime an app
runs from EITHER its source or its build — never both in one directory — so this
still guarantees a built `.js` and a dev `.ts` of the same module never
double-register. `.d.ts` declarations are still skipped.

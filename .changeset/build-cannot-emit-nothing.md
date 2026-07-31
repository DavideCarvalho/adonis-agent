---
'@adonis-agora/agent': patch
'@adonis-agora/agent-dashboard': patch
---

**No published version of either package is affected.** This is a repo-tooling fix with no runtime change — nothing in `src/` moved. Checked rather than assumed: the live tarballs for `@adonis-agora/agent@0.17.0` and `@adonis-agora/agent-dashboard@0.3.2` contain 105 and 13 `.js` files respectively, exactly what a full local build emits. The release workflow publishes from a cold `actions/checkout`, which has no `dist/` and no `.tsbuildinfo` to go stale, so the defect below could not reach npm. It could reach a contributor's working copy, and did.

`pnpm build` could exit `0` having emitted no JavaScript. `tsc` ran with `incremental: true` against a `.tsbuildinfo` that records what it already wrote to `dist/`; delete `dist/` and leave the buildinfo behind and `tsc` concludes every output is current and emits nothing. In `@adonis-agora/agent`, `copy:stubs` is a plain `cp` and ran anyway, so `dist/` came out holding four stub files and zero `.js`. Turbo then cached that empty directory as a *successful* `build` and replayed it onto clean trees — a later `pnpm build` on a freshly wiped checkout restored the vacuum as `FULL TURBO` in 32ms. Downstream, `packages/dashboard` failed with `TS2307: Cannot find module '@adonis-agora/agent'` against the package that had just "built".

Both packages are fixed the same way:

- `build` removes `dist/` up front and compiles through a new `tsconfig.build.json` with `incremental: false`, so an emit is always a full emit and no state survives to disagree with `dist/`.
- A new `scripts/assert-build-output.mjs` runs as the last step of `build` and fails it if `dist/` holds no JavaScript or is missing the package entrypoint. It runs inside the build, so it also covers `prepack` — which never goes through turbo, and is the path a manual `pnpm publish` would take.
- `build` and `typecheck` no longer share a buildinfo. `typecheck` keeps `.typecheck.tsbuildinfo`; `build` keeps none at all. `turbo.json` is unchanged.

If you have a checkout in the broken state, the guard now prints the way out — and the command it prints works, which took a second pass to get right: the buildinfo files are dotfiles and a shell `*` does not match those.

```
rm -rf dist .*tsbuildinfo *.tsbuildinfo
pnpm run build
```

The dashboard's exposure needed a different guard. Its `build` is `vite build && tsc`, and vite keeps populating `dist/spa/` whatever `tsc` does — a `dist/` with no provider in it still holds a dozen `.js` files. Counting JavaScript would have passed it, so `check:dist` there asserts the entrypoint by name.

Neither a count nor a named entrypoint is enough on its own. A *partial* emit was observed during this fix: `dist/` came out holding exactly one `.js`, `src/index.js`, which satisfies both checks — and because `index.d.ts` was there too, the dashboard compiled against it without a single `TS2307`. Every subpath export (`@adonis-agora/agent/rag-media`, `/durable`, `/testing`, …) pointed at a file that did not exist, and the first thing to notice would have been a consumer's failed import. So the guard also walks `package.json`'s `exports` and requires every target it declares. That list is the package's real publish contract, and it maintains itself — adding an export adds a post-condition, with nobody having to remember. It also covers `@adonis-agora/agent-dashboard/client`, which the by-name check never looked at.

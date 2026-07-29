---
'@adonis-agora/agent': patch
---

**Security fix**: `dataTool`'s tenant scoping no longer treats a tenant predicate found under an `OR` as coverage.

`TenantScopeRewriter.collectTenantPredicates` recursed into `OR` branches exactly as it did into `AND` branches, with no record of which boolean context it was in. Any tenant predicate found anywhere in a query's `WHERE` tree — including inside an `OR` — marked that table's alias "already scoped", so the rewriter added no constraint at all. A model-authored query of the form `... WHERE base_id = '<own tenant>' OR 1 = 1` (or any other disjunctive shape naming the caller's own tenant) passed through unconstrained and returned every tenant's rows from an allow-listed table.

Coverage is now computed from the top-level `AND` spine only (`collectConjunctiveTenantPredicates`): a predicate under an `OR`, `NOT`, or any non-conjunctive operator no longer suppresses the AND-ed tenant constraint. The **mismatch rejection** is unchanged and deliberately still walks the *whole* tree (`collectAllTenantPredicates`): a query naming a foreign tenant anywhere — even inside an `OR` — still throws `tenant scope: tenant mismatch`, rather than being silently AND-ed down to zero rows.

**Behaviour change**: queries that previously passed through unconstrained because of an `OR`-side tenant predicate (e.g. `WHERE base_id = 'mine' OR 1 = 1`, `WHERE (base_id = 'mine' AND x) OR y`) are now correctly constrained — the emitted SQL gains an additional `AND <tenantColumn> = '<tenantRef>'`. A query whose tenant predicate is already on the top-level `AND` spine is unaffected (no duplicate predicate is added).

A second, adjacent bug was found and fixed while implementing this: `andCondition` built the AND-tenant-predicate AST node without marking the pre-existing (possibly `OR`-rooted) `WHERE` as parenthesized. `node-sql-parser`'s printer only wraps a subexpression in `(...)` when a `parentheses` flag is explicitly set on it — without it, `AND`/`OR` print at the same precedence, left-to-right, so a real database (which applies standard SQL precedence, `AND` binding tighter than `OR`) would have misread the emitted text and applied the tenant constraint to only the last disjunct, silently re-opening the same bypass this fix closes. `andCondition` now always parenthesizes the existing WHERE before AND-ing.

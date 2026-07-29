import type { AST, SqlParserLike } from './parser.js';

/** Configuration for {@link TenantScopeRewriter}. */
export interface TenantScopeConfig {
  /** The column that carries the tenant key on every scoped table (e.g. `base_id`, `org_id`). */
  tenantColumn: string;
  /** Tables that must be constrained to the caller's tenant when referenced. */
  scopedTables: string[];
}

interface FromEntry {
  table?: string;
  as?: string | null;
  join?: string;
  expr?: { ast?: unknown };
}

interface SelectAst {
  type: string;
  with?: unknown;
  from?: FromEntry[];
  where?: unknown;
  _next?: unknown;
}

interface BinaryExpr {
  type: 'binary_expr';
  operator: string;
  left: unknown;
  right: unknown;
  /**
   * node-sql-parser only wraps a subexpression in `(...)` on print when this flag is set on it —
   * it is NOT inferred from tree shape. Load-bearing for {@link TenantScopeRewriter.andCondition}:
   * this parser's printer renders `AND`/`OR` at the SAME precedence, left-to-right, when this flag
   * is absent (verified directly: `x = 1 OR x = 2 AND y = 3` prints unparenthesized and reparses as
   * `(x = 1 OR x = 2) AND y = 3`, NOT the standard-SQL `x = 1 OR (x = 2 AND y = 3)` a real database
   * would apply to that same text). Without forcing this flag on an OR-rooted `existing` WHERE
   * before AND-ing the tenant predicate onto it, the emitted SQL would round-trip correctly through
   * THIS library but be misread by the actual database the query runs against — defeating the
   * constraint for exactly the OR-shaped queries this rewriter exists to constrain.
   */
  parentheses?: boolean;
}

interface ColumnRef {
  type: 'column_ref';
  table: string | null;
  column: string;
}

interface ExtractedPredicate {
  tableAlias: string | null;
  value: string;
}

const STRING_LITERAL_TYPES = new Set(['string', 'single_quote_string', 'double_quote_string']);

/**
 * Rewrites a SELECT so every reference to a scoped table is constrained to a
 * single tenant: `<tenantColumn> = '<tenantRef>'` is AND-ed into the WHERE for
 * each scoped table in the FROM. An existing predicate for a different tenant
 * is rejected (no cross-tenant reads). `tenantRef === undefined` is the
 * privileged path and passes the SQL through unchanged.
 *
 * CRITICAL: only a strictly `=== undefined` tenantRef is privileged. A `null`
 * or empty-string tenantRef is NOT privileged — it flows into the rewrite and
 * injects a predicate that matches nothing (fail-closed), so a missing tenant
 * can never accidentally read every tenant's rows.
 *
 * Scoped mode rejects CTEs, UNION/INTERSECT/EXCEPT, and subqueries in FROM:
 * those make it impossible to statically guarantee every tenant-bearing source
 * is constrained, so we fail closed and ask the caller to rephrase.
 *
 * The `node-sql-parser` `Parser` is injected (see {@link loadSqlParser}) so this file never imports the
 * optional peer at module load.
 */
export class TenantScopeRewriter {
  private readonly tenantColumn: string;
  private readonly scopedTables: Set<string>;

  constructor(
    config: TenantScopeConfig,
    private readonly parser: SqlParserLike,
  ) {
    this.tenantColumn = config.tenantColumn;
    this.scopedTables = new Set(config.scopedTables);
  }

  /** Rewrite `sql` to constrain scoped tables to `tenantRef`. Strictly-`undefined` → pass through. */
  rewrite(sql: string, tenantRef: string | undefined): string {
    if (tenantRef === undefined) return sql;

    const parsed = this.parser.astify(sql, { database: 'MySQL' });
    const ast = (Array.isArray(parsed) ? parsed[0] : parsed) as SelectAst;

    if (ast.type !== 'select') {
      throw new Error('tenant scope: only SELECT is supported');
    }
    if (ast.with) {
      throw new Error(
        'tenant scope: WITH (CTE) is not supported in scoped mode — rewrite using JOINs/subqueries in FROM',
      );
    }
    if (ast._next) {
      throw new Error(
        'tenant scope: UNION/INTERSECT/EXCEPT is not supported in scoped mode — run each branch as a separate query',
      );
    }

    const fromEntries = ast.from ?? [];
    for (const entry of fromEntries) {
      if (!entry.table && entry.expr?.ast) {
        throw new Error('tenant scope: subqueries in FROM are not supported in scoped mode');
      }
    }

    const scopedFrom = fromEntries.filter(
      (entry): entry is FromEntry & { table: string } =>
        typeof entry.table === 'string' && this.scopedTables.has(entry.table),
    );
    if (scopedFrom.length === 0) return sql;

    // Mismatch rejection looks at every tenant literal anywhere in the tree — including under an
    // OR or NOT — because a query that so much as *names* a foreign tenant is suspicious and must
    // throw, not silently be AND-ed down to zero rows.
    const allPredicates = this.collectAllTenantPredicates(ast.where);
    for (const predicate of allPredicates) {
      if (predicate.value !== tenantRef) {
        throw new Error(
          'tenant scope: tenant mismatch — query targets a tenant other than the current session',
        );
      }
    }

    // Coverage is a different question: a predicate only actually constrains every row the query
    // can return when it is on the top-level AND spine. A predicate under an OR (or NOT, or any
    // other non-conjunctive operator) does not guarantee the constraint holds, so it must NOT
    // suppress the AND-ed constraint below — see `collectConjunctiveTenantPredicates`.
    const conjunctive = this.collectConjunctiveTenantPredicates(ast.where);
    const coveredAliases = new Set(conjunctive.map((predicate) => predicate.tableAlias));
    for (const entry of scopedFrom) {
      const alias = entry.as ?? entry.table;
      const isAmbiguous = scopedFrom.length > 1;
      const covered = coveredAliases.has(alias) || (!isAmbiguous && coveredAliases.has(null));
      if (covered) continue;
      ast.where = this.andCondition(
        ast.where,
        this.buildTenantEquality(isAmbiguous ? alias : null, tenantRef),
      );
    }

    return this.parser.sqlify(ast as unknown as AST, { database: 'MySQL' });
  }

  /**
   * Every tenant-column `=` predicate anywhere in the tree (recurses into both `AND` and `OR`).
   * Used ONLY for the mismatch check: a query naming a foreign tenant anywhere must be rejected,
   * even where that predicate cannot be relied on to actually constrain the result set.
   */
  private collectAllTenantPredicates(where: unknown): ExtractedPredicate[] {
    if (!isBinaryExpr(where)) return [];
    if (where.operator === 'AND' || where.operator === 'OR') {
      return [
        ...this.collectAllTenantPredicates(where.left),
        ...this.collectAllTenantPredicates(where.right),
      ];
    }
    return this.extractTenantPredicate(where);
  }

  /**
   * Tenant-column `=` predicates on the top-level `AND` spine only. Descent stops at `OR` (and at
   * any operator other than `AND`/`=`, e.g. `NOT`, which the parser represents as a `unary_expr`
   * and so is never a `binary_expr` here) because only a conjunctively-combined predicate is
   * guaranteed to hold for every row the query can return. Used for coverage: a table alias is
   * "already scoped" only when one of these covers it.
   */
  private collectConjunctiveTenantPredicates(where: unknown): ExtractedPredicate[] {
    if (!isBinaryExpr(where)) return [];
    if (where.operator === 'AND') {
      return [
        ...this.collectConjunctiveTenantPredicates(where.left),
        ...this.collectConjunctiveTenantPredicates(where.right),
      ];
    }
    return this.extractTenantPredicate(where);
  }

  private extractTenantPredicate(where: BinaryExpr): ExtractedPredicate[] {
    if (where.operator !== '=') return [];
    const lhs = where.left;
    const rhs = where.right;
    if (!isColumnRef(lhs) || lhs.column !== this.tenantColumn) return [];
    if (!isStringLiteral(rhs)) return [];
    return [{ tableAlias: lhs.table ?? null, value: rhs.value }];
  }

  private buildTenantEquality(tableAlias: string | null, tenantRef: string): BinaryExpr {
    return {
      type: 'binary_expr',
      operator: '=',
      left: { type: 'column_ref', table: tableAlias, column: this.tenantColumn },
      right: { type: 'single_quote_string', value: tenantRef },
    };
  }

  private andCondition(existing: unknown, added: BinaryExpr): BinaryExpr {
    if (existing == null) return added;
    return {
      type: 'binary_expr',
      operator: 'AND',
      // Force `parentheses: true` regardless of whether the original SQL already had explicit
      // parens here — see the doc comment on `BinaryExpr.parentheses`. Without it, an OR-rooted
      // `existing` prints without the grouping parens a real database needs to apply the AND-ed
      // tenant predicate to the WHOLE existing expression rather than just its last disjunct.
      left: this.forceParens(existing),
      right: added,
    };
  }

  private forceParens(node: unknown): unknown {
    if (typeof node !== 'object' || node === null) return node;
    return { ...node, parentheses: true };
  }
}

function isBinaryExpr(value: unknown): value is BinaryExpr {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'binary_expr'
  );
}

function isColumnRef(value: unknown): value is ColumnRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'column_ref'
  );
}

function isStringLiteral(value: unknown): value is { type: string; value: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string' &&
    STRING_LITERAL_TYPES.has((value as { type: string }).type) &&
    typeof (value as { value?: unknown }).value === 'string'
  );
}

import type { AST } from 'node-sql-parser';

/**
 * The slice of `node-sql-parser`'s `Parser` the data satellite uses. Typed structurally so the guardrail
 * files (`sql-validator`, `tenant-scope`, `limit`) never import the package at module load — they take a
 * parser instance. `node-sql-parser` stays an **optional lazy peer**: only {@link loadSqlParser} imports it,
 * and only when the `data` tool is actually built.
 */
export interface SqlParserLike {
  astify(sql: string, opt?: { database?: string }): AST | AST[];
  sqlify(ast: AST, opt?: { database?: string }): string;
  tableList(sql: string, opt?: { database?: string }): string[];
}

/** Re-export the parser AST type for the guardrail files (type-only — erased at compile). */
export type { AST } from 'node-sql-parser';

let cached: Promise<SqlParserLike> | null = null;

/**
 * Lazily import `node-sql-parser` and build a single shared {@link SqlParserLike}. The import lives here
 * (not at any module's top level) so the package is only pulled in when the `data` tool is configured —
 * keeping `node-sql-parser` an optional peer, exactly like `@adonisjs/lucid` is for the stores.
 */
export function loadSqlParser(): Promise<SqlParserLike> {
  if (cached === null) {
    cached = import('node-sql-parser').then((mod) => {
      // `node-sql-parser` is CJS: under Node ESM the named `Parser` export isn't surfaced, so reach it
      // through the interop default. Fall back to a real named export for bundlers that do surface it.
      const ParserCtor = (
        mod as unknown as {
          Parser?: new () => SqlParserLike;
          default?: { Parser: new () => SqlParserLike };
        }
      ).default?.Parser ?? (mod as unknown as { Parser: new () => SqlParserLike }).Parser;
      return new ParserCtor() as unknown as SqlParserLike;
    });
  }
  return cached;
}

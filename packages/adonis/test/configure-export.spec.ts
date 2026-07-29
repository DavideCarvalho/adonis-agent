import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Regression test for `node ace add @adonis-agora/agent` doing nothing: AdonisJS resolves the
 * configure hook by importing the package's MAIN entry and reading `configure` off the module
 * namespace. The `./configure` subpath alone is never consulted, so a source-level assertion
 * (`import { configure } from '../src/index.js'` pre-build, or asserting against `configure.ts`
 * directly) would have passed for the entire life of this bug — it must run against the BUILT
 * artifact the same way AdonisJS does.
 */
const distIndexPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'src',
  'index.js',
);
const distExists = existsSync(distIndexPath);

describe('built package main exports the configure hook', () => {
  it.skipIf(!distExists)(
    'dist/src/index.js exports `configure` as a function (mirrors how AdonisJS imports the package main)',
    async () => {
      const mod = (await import(distIndexPath)) as Record<string, unknown>;
      expect(typeof mod.configure).toBe('function');
    },
  );

  if (!distExists) {
    console.warn(
      `[configure-export.spec.ts] Skipped: ${distIndexPath} does not exist. Run \`pnpm --filter @adonis-agora/agent build\` first to exercise this regression test against the built artifact.`,
    );
  }
});

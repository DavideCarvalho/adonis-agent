import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** Guards the `build` post-condition, which exists because `pnpm build` could exit 0 having
 *  emitted no JavaScript: `tsc` with `incremental: true` treats its buildinfo as the record of
 *  what is on disk, so deleting `dist/` and leaving the buildinfo made it emit nothing. `copy:stubs`
 *  is a plain `cp` and ran anyway, so `dist/` looked built. Turbo then cached that empty directory
 *  as a successful `build` and replayed it onto clean trees, and `packages/dashboard` failed with
 *  TS2307 against the package that had just "built".
 *
 *  What this spec deliberately does NOT do: shell out to `tsc`. Reproducing the defect end to end
 *  costs a full build per case. So it covers the two halves that are cheap and still load-bearing:
 *  the guard script's own exit codes (milliseconds, no compiler), and the fact that `build` really
 *  invokes it with `clean` ahead of the compile and the non-incremental config. The end-to-end
 *  proof lives in the guard being on the real build path, not in a test that would rot. */
describe('build post-condition', () => {
  const scriptPath = fileURLToPath(
    new URL('../../../scripts/assert-build-output.mjs', import.meta.url),
  );

  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'agent-build-postcondition-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  function runGuard(...args: string[]) {
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
      cwd: workDir,
      encoding: 'utf8',
    });
    return { status: result.status, stderr: result.stderr ?? '' };
  }

  it('passes when dist has JavaScript and the required entrypoint', () => {
    mkdirSync(join(workDir, 'dist', 'src'), { recursive: true });
    writeFileSync(join(workDir, 'dist', 'src', 'index.js'), 'export const ok = true;\n');

    expect(runGuard('dist', 'src/index.js').status).toBe(0);
  });

  it('fails when dist exists but holds no JavaScript — the exact shape of the cached empty build', () => {
    // What the defect produced here: four stub files copied by `copy:stubs` and not one `.js`.
    mkdirSync(join(workDir, 'dist', 'stubs', 'config'), { recursive: true });
    writeFileSync(join(workDir, 'dist', 'stubs', 'config', 'agent.stub'), '// stub\n');

    const { status, stderr } = runGuard('dist', 'src/index.js');

    expect(status).toBe(1);
    expect(stderr).toContain('no JavaScript');
    expect(stderr).toContain('How to recover');
  });

  it('fails when dist does not exist at all', () => {
    const { status, stderr } = runGuard('dist', 'src/index.js');

    expect(status).toBe(1);
    expect(stderr).toContain('does not exist');
  });

  it('fails when JavaScript was emitted but the package entrypoint is missing', () => {
    // Not hypothetical: a partial incremental emit produced a dist holding exactly one `.js`.
    // A count alone would have called that a success.
    mkdirSync(join(workDir, 'dist', 'src'), { recursive: true });
    writeFileSync(join(workDir, 'dist', 'src', 'something-else.js'), 'export const ok = true;\n');

    const { status, stderr } = runGuard('dist', 'src/index.js');

    expect(status).toBe(1);
    expect(stderr).toContain('src/index.js');
  });

  it('names a recovery command that actually removes the stale state it points at', () => {
    // The buildinfo files are dotfiles. A bare `*.tsbuildinfo` in the hint would not match them,
    // so following the advice would leave the tree exactly as broken as before.
    const { stderr } = runGuard('dist', 'src/index.js');

    expect(stderr).toContain('.*tsbuildinfo');
  });

  it('is wired into the build script, behind the compile and ahead of nothing', () => {
    // Without this, the guard is a file nobody runs. Asserting on the script text is shallow but it
    // is the one thing that catches the guard being quietly dropped from the pipeline.
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(pkg.scripts.build).toContain('check:dist');
    expect(pkg.scripts['check:dist']).toContain('assert-build-output.mjs');

    // `clean` must precede the compile: removing dist/ up front is what stops stale incremental
    // state from existing in the first place. And the compile must use the non-incremental config,
    // so build keeps no buildinfo that could disagree with dist/ or race typecheck's.
    const build = pkg.scripts.build!; // asserted present above
    expect(build.indexOf('clean')).toBeLessThan(build.indexOf('tsc'));
    expect(build).toContain('tsconfig.build.json');
  });

  it('builds through a config that cannot keep incremental state', () => {
    const buildConfig = JSON.parse(
      readFileSync(fileURLToPath(new URL('../tsconfig.build.json', import.meta.url)), 'utf8'),
    ) as { compilerOptions: { incremental: boolean; tsBuildInfoFile: string | null } };

    expect(buildConfig.compilerOptions.incremental).toBe(false);
    expect(buildConfig.compilerOptions.tsBuildInfoFile).toBeNull();
  });

  it('keeps typecheck buildinfo off the name build used to write', () => {
    // build and typecheck sharing one buildinfo is how turbo's typecheck cache could restore a
    // build's incremental record. typecheck owns `.typecheck.tsbuildinfo`; build owns nothing.
    const typecheckConfig = readFileSync(
      fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
      'utf8',
    );

    expect(typecheckConfig).toContain('.typecheck.tsbuildinfo');
  });
});

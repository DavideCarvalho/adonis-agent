// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** The dashboard shares `packages/adonis`'s build defect and needs its own wiring assertion,
 *  because its exposure has a sharper edge: `build` is `vite build && tsc`, and vite keeps emitting
 *  into `dist/spa/` no matter what tsc does. A dist with no provider in it still holds a dozen
 *  `.js` files, so a bare "did we emit any JavaScript" count would wave it through. That is why
 *  `check:dist` here names the entrypoint.
 *
 *  The guard script's own behaviour is covered once, in packages/adonis. */
describe('dashboard build post-condition', () => {
  const pkg = JSON.parse(
    readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
  ) as { main: string; scripts: Record<string, string> };

  it('runs the guard as the last step of build', () => {
    expect(pkg.scripts.build).toContain('check:dist');
    expect(pkg.scripts['check:dist']).toContain('assert-build-output.mjs');
  });

  it('asserts the entrypoint by name, not just that some JavaScript exists', () => {
    // vite's output would satisfy a count on its own. The name is the whole point.
    const entrypoint = pkg.main.replace(/^\.\/dist\//, '');

    expect(pkg.scripts['check:dist']).toContain(entrypoint);
  });

  it('cleans before it compiles and compiles without incremental state', () => {
    const build = pkg.scripts.build!;

    expect(build.indexOf('clean')).toBeLessThan(build.indexOf('tsc'));
    expect(build).toContain('tsconfig.build.json');

    const buildConfig = JSON.parse(
      readFileSync(fileURLToPath(new URL('../tsconfig.build.json', import.meta.url)), 'utf8'),
    ) as { compilerOptions: { incremental: boolean; tsBuildInfoFile: string | null } };

    expect(buildConfig.compilerOptions.incremental).toBe(false);
    expect(buildConfig.compilerOptions.tsBuildInfoFile).toBeNull();
  });
});

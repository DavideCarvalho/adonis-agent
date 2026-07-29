import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the three documented facts about `governanceAuthorize` against drift.
 *
 * The mount split (no gate → `/agent/governance/*` is not mounted) left three doc sites describing
 * the OLD open-by-default behaviour: the public `AgentConfig.governanceAuthorize` JSDoc, the two
 * JSDoc blocks in `governance-gate.ts`, and the provider's boot warning. A doc comment that
 * contradicts the code is the artifact a reader trusts most and verifies least, and this repo has
 * already paid for that twice (`delegateInputSchema`'s "the loop validates against it", authkit's
 * `admin.impersonation` docblocks).
 *
 * Deliberately narrow. Prose cannot be diffed the way the sibling `adonis-durable` drift spec diffs
 * two column-name lists, so this asserts ONLY on machine-stable tokens — the config key, the literal
 * migration escape hatch `governanceAuthorize: () => true`, the route path `approvals/mine`, and a
 * "not mount" claim — plus a negative assertion on the exact retired sentences. Rewording is free;
 * dropping a fact or resurrecting the false claim is not.
 */

const currentDir = dirname(fileURLToPath(import.meta.url));
const read = (...segments: string[]) => readFileSync(join(currentDir, '..', ...segments), 'utf8');

/** Collapse a JSDoc block or a wrapped string literal to one line: drop `*` gutters and wrapping. */
function flatten(text: string): string {
  return text
    .replace(/\s*\n\s*\*?\s?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The `/** … *\/` block immediately preceding `marker`, flattened. Anchored on the declaration rather
 * than on a line number so renaming the property (not just moving it) is what breaks the test.
 */
function jsdocBefore(source: string, marker: string): string {
  const at = source.indexOf(marker);
  if (at === -1) throw new Error(`marker not found in source: ${marker}`);
  const end = source.lastIndexOf('*/', at);
  const start = source.lastIndexOf('/**', end);
  if (end === -1 || start === -1) throw new Error(`no JSDoc block precedes: ${marker}`);
  return flatten(source.slice(start + 3, end));
}

/**
 * The argument text of every `callee(...)` call, bounded by bracket-depth matching from the opening
 * `(` to its partner — not by scanning to the next call — so a later call in the file cannot swallow
 * or truncate an earlier one. (The scan does not skip string contents; every bracket inside the
 * warning strings here is balanced, and an unbalanced one throws loudly rather than silently
 * mis-slicing.)
 */
function callArguments(source: string, callee: string): string[] {
  const found: string[] = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf(`${callee}(`, from);
    if (at === -1) return found;
    const open = at + callee.length;
    let depth = 1;
    let cursor = open + 1;
    while (depth > 0) {
      if (cursor >= source.length) throw new Error(`unbalanced brackets after ${callee}(`);
      const char = source[cursor];
      if (char === '(' || char === '{' || char === '[') depth++;
      else if (char === ')' || char === '}' || char === ']') depth--;
      cursor++;
    }
    found.push(source.slice(open + 1, cursor - 1));
    from = cursor;
  }
}

const defineConfigSource = read('src', 'define_config.ts');
const gateSource = read('src', 'governance-gate.ts');
const providerSource = read('providers', 'agent_provider.ts');

/** The provider's governance boot warning — the runtime voice the three doc sites must agree with. */
function governanceBootWarning(): string {
  const warnings = callArguments(providerSource, 'console.warn')
    .map(flatten)
    .filter((text) => text.includes('governance'));
  if (warnings.length !== 1) {
    throw new Error(`expected exactly one governance console.warn, found ${warnings.length}`);
  }
  return warnings[0];
}

const sites: [name: string, text: string][] = [
  [
    'AgentConfig.governanceAuthorize JSDoc',
    jsdocBefore(defineConfigSource, 'governanceAuthorize?: AgentGovernanceAuthorize;'),
  ],
  [
    'AgentGovernanceAuthorize JSDoc',
    jsdocBefore(gateSource, 'export type AgentGovernanceAuthorize'),
  ],
  [
    'evaluateGovernanceGate JSDoc',
    jsdocBefore(gateSource, 'export async function evaluateGovernanceGate'),
  ],
  ['agent provider boot warning', governanceBootWarning()],
];

describe.each(sites)('%s', (_name, text) => {
  it('states that the routes are not mounted without a gate', () => {
    expect(text.toLowerCase()).toMatch(/not mount/);
  });

  it('names the `governanceAuthorize` config key', () => {
    expect(text).toContain('governanceAuthorize');
  });

  it('offers `governanceAuthorize: () => true` as the explicit opt-in to the old behaviour', () => {
    expect(text).toContain('governanceAuthorize: () => true');
  });

  it('says `approvals/mine` is unaffected', () => {
    expect(text).toContain('approvals/mine');
    expect(text.toLowerCase()).toMatch(/unaffected|stays mounted/);
  });

  it('does not resurrect the retired claim that governance is readable without a gate', () => {
    expect(text.toLowerCase()).not.toContain('any resolved actor may read governance');
    expect(text.toLowerCase()).not.toContain('governance open to any resolved actor');
  });
});

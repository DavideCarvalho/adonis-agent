import { describe, expect, it } from 'vitest';
import { chunkText } from '../src/index.js';

/**
 * A paragraph-bearing prose sample and a field-labelled record sample, reused across the guard and the
 * separator tests so the two behaviours are compared on the same footing.
 */
const PROSE = `Refunds are issued to the original payment method within five business days of approval. If the original method is no longer valid we issue store credit instead.

Orders ship in two business days via the standard carrier. Expedited shipping is available at checkout for an additional fee, and cut-off is 2pm local time.

Returns are accepted within thirty days of delivery for a full refund, provided the item is unopened. Opened items are eligible for exchange only.`;

const RECORD_LINES = [
  'row=1 | name=Ada Lovelace | role=Analyst | city=London',
  'row=2 | name=Alan Turing | role=Engineer | city=Manchester',
  'row=3 | name=Grace Hopper | role=Admiral | city=Arlington',
];
const RECORDS = RECORD_LINES.join('\n');

/**
 * REGRESSION GUARD — the exact boundaries the prose chunker produced BEFORE `separator` existed,
 * frozen as literals rather than snapshots so no `-u` can quietly re-bless them.
 *
 * This is not a nice-to-have. Chunk boundaries are baked into every consumer's index: a chunk id
 * (`${docId}#<n>`) maps to a stored embedding of a specific span of text. Shifting a boundary by one
 * character silently invalidates the stored vectors for every document downstream of it and forces a
 * full re-embed — a cost no consumer can discover from a minor version bump. So `separator` must be
 * inert when it is not passed, and these cases prove it: they were recorded against the pre-feature
 * implementation and must stay byte-for-byte identical after it.
 */
describe('chunkText — prose regression guard (no separator passed)', () => {
  it('leaves a short text as a single chunk', () => {
    expect(chunkText('a short doc')).toEqual(['a short doc']);
  });

  it('leaves whitespace-only input empty', () => {
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('keeps prose under the default chunkSize as one chunk', () => {
    expect(chunkText(PROSE)).toEqual([PROSE]);
  });

  it('reproduces the pre-feature boundaries at chunkSize 200 / overlap 40', () => {
    expect(chunkText(PROSE, { chunkSize: 200, overlap: 40 })).toEqual([
      'Refunds are issued to the original payment method within five business days of approval. If the original method is no longer valid we issue store credit instead.\n\nOrders ship in two business days via',
      '.\n\nOrders ship in two business days via the standard carrier. Expedited shipping is available at checkout for an additional fee, and cut-off is 2pm local time.\n\nReturns are accepted within thirty',
      'me.\n\nReturns are accepted within thirty days of delivery for a full refund, provided the item is unopened. Opened items are eligible for exchange only.',
    ]);
  });

  it('reproduces the pre-feature boundaries at chunkSize 120 / overlap 0', () => {
    expect(chunkText(PROSE, { chunkSize: 120, overlap: 0 })).toEqual([
      'Refunds are issued to the original payment method within five business days of approval. If the original method is no',
      'longer valid we issue store credit instead.\n\nOrders ship in two business days via the standard carrier. Expedited',
      'shipping is available at checkout for an additional fee, and cut-off is 2pm local time.\n\nReturns are accepted within',
      'thirty days of delivery for a full refund, provided the item is unopened. Opened items are eligible for exchange only.',
    ]);
  });

  it('still cuts record-shaped text mid-record when no separator is passed (the motivating bug)', () => {
    // Frozen deliberately: this is the WRONG output for this input, and it must stay the output until
    // the caller opts into `separator`. `row=3` is stranded at the end of chunk 0 with none of its
    // fields, and chunk 1 opens on `ty=Manchester` — half of a city value.
    expect(chunkText(RECORDS, { chunkSize: 120, overlap: 20 })).toEqual([
      'row=1 | name=Ada Lovelace | role=Analyst | city=London\nrow=2 | name=Alan Turing | role=Engineer | city=Manchester\nrow=3',
      'ty=Manchester\nrow=3 | name=Grace Hopper | role=Admiral | city=Arlington',
    ]);
  });
});

describe('chunkText — separator: records are the only cut points', () => {
  it('never cuts inside a record, and never emits a partial one', () => {
    const chunks = chunkText(RECORDS, { chunkSize: 120, overlap: 0, separator: '\n' });
    // Every line of every chunk is a WHOLE record from the source.
    for (const chunk of chunks) {
      for (const line of chunk.split('\n')) {
        expect(RECORD_LINES).toContain(line);
      }
    }
    // And every record survives somewhere.
    for (const line of RECORD_LINES) {
      expect(chunks.some((chunk) => chunk.includes(line))).toBe(true);
    }
  });

  it('packs as many whole records per chunk as chunkSize allows, rejoined by the separator', () => {
    expect(chunkText(RECORDS, { chunkSize: 120, overlap: 0, separator: '\n' })).toEqual([
      `${RECORD_LINES[0]}\n${RECORD_LINES[1]}`,
      RECORD_LINES[2],
    ]);
  });

  it('accepts a multi-character separator and does not re-emit it at a chunk edge', () => {
    const text = ['alpha', 'beta', 'gamma', 'delta'].join('---');
    expect(chunkText(text, { chunkSize: 13, overlap: 0, separator: '---' })).toEqual([
      'alpha---beta',
      'gamma---delta',
    ]);
  });

  it('drops empty and whitespace-only records rather than emitting blank chunks', () => {
    const text = 'a=1\n\n   \nb=2\n\nc=3';
    expect(chunkText(text, { chunkSize: 8, overlap: 0, separator: '\n' })).toEqual([
      'a=1\nb=2',
      'c=3',
    ]);
  });

  it('returns one chunk per record when chunkSize admits only one', () => {
    expect(chunkText(RECORDS, { chunkSize: 60, overlap: 0, separator: '\n' })).toEqual(
      RECORD_LINES,
    );
  });

  it('returns [] for input that is nothing but separators', () => {
    expect(chunkText('\n\n\n', { separator: '\n' })).toEqual([]);
  });
});

describe('chunkText — separator: an over-long record is emitted whole', () => {
  const LONG = `id=7 | note=${'x'.repeat(300)}`;

  it('emits a record longer than chunkSize as its own chunk, intact and over-size', () => {
    const text = ['a=1', LONG, 'b=2'].join('\n');
    const chunks = chunkText(text, { chunkSize: 50, overlap: 0, separator: '\n' });
    expect(chunks).toEqual(['a=1', LONG, 'b=2']);
    // The documented trade: chunkSize is a TARGET under `separator`, not a cap.
    expect(chunks[1]!.length).toBeGreaterThan(50);
  });

  it('does not fall back to a mid-record prose cut for the over-long record', () => {
    const chunks = chunkText(LONG, { chunkSize: 50, overlap: 0, separator: '\n' });
    expect(chunks).toEqual([LONG]);
    expect(chunks).toHaveLength(1);
  });

  it('keeps an over-long record from dragging its neighbours into an over-size chunk', () => {
    const chunks = chunkText(['a=1', 'b=2', LONG].join('\n'), {
      chunkSize: 20,
      overlap: 0,
      separator: '\n',
    });
    expect(chunks).toEqual(['a=1\nb=2', LONG]);
  });
});

describe('chunkText — separator: overlap is a whole-record budget', () => {
  const lines = ['r=1', 'r=2', 'r=3', 'r=4', 'r=5', 'r=6'];
  const text = lines.join('\n');

  it('carries whole trailing records into the next chunk, never a partial one', () => {
    // chunkSize 11 fits three 3-char records ("r=1\nr=2\nr=3"); overlap 4 admits one whole
    // trailing record (3 chars + its separator) but not two.
    const chunks = chunkText(text, { chunkSize: 11, overlap: 4, separator: '\n' });
    expect(chunks).toEqual(['r=1\nr=2\nr=3', 'r=3\nr=4\nr=5', 'r=5\nr=6']);
    for (const chunk of chunks) {
      for (const record of chunk.split('\n')) {
        expect(lines).toContain(record);
      }
    }
  });

  it('carries nothing when overlap is 0', () => {
    expect(chunkText(text, { chunkSize: 11, overlap: 0, separator: '\n' })).toEqual([
      'r=1\nr=2\nr=3',
      'r=4\nr=5\nr=6',
    ]);
  });

  it('always advances even when overlap would swallow the whole previous chunk', () => {
    // overlap far larger than the chunk: the guard must still consume at least one record per chunk,
    // or this loops forever.
    const chunks = chunkText(text, { chunkSize: 11, overlap: 1000, separator: '\n' });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThan(10);
    expect(chunks.at(-1)).toContain('r=6');
  });

  it('never carries an over-long record forward as overlap', () => {
    const long = 'z'.repeat(200);
    const chunks = chunkText(['a=1', long, 'b=2'].join('\n'), {
      chunkSize: 20,
      overlap: 1000,
      separator: '\n',
    });
    expect(chunks).toEqual(['a=1', long, 'b=2']);
  });
});

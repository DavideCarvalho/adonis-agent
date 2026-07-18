import { expect, it } from 'vitest';
import { frameToSse } from '../src/sse.js';

it('encodes a text frame as the delta envelope (byte-identical to legacy)', () => {
  expect(frameToSse({ t: 'text', v: 'hi' })).toBe('data: {"delta":"hi"}\n\n');
});

it('encodes a component frame as an event: component frame', () => {
  expect(frameToSse({ t: 'component', name: 'card_metrica', data: { a: 1 } })).toBe(
    'event: component\ndata: {"name":"card_metrica","data":{"a":1}}\n\n',
  );
});

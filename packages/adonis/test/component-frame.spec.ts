import { expect, it } from 'vitest';
import { InProcessTokenStreamSink } from '../src/in-process-sink.js';
import type { StreamFrame } from '../src/index.js';

async function collect(iter: AsyncIterable<StreamFrame>): Promise<StreamFrame[]> {
  const out: StreamFrame[] = [];
  for await (const f of iter) out.push(f);
  return out;
}

it('interleaves text and component frames in order', async () => {
  const sink = new InProcessTokenStreamSink();
  const w = await sink.open('r1');
  await w.write({ t: 'text', v: 'olha ' });
  await w.write({ t: 'component', name: 'grafico_evolucao', data: { metricType: 'glicose' } });
  await w.write({ t: 'text', v: 'tá subindo' });
  await w.end();
  const frames = await collect(sink.subscribe('r1'));
  expect(frames).toEqual([
    { t: 'text', v: 'olha ' },
    { t: 'component', name: 'grafico_evolucao', data: { metricType: 'glicose' } },
    { t: 'text', v: 'tá subindo' },
  ]);
});

import { describe, expect, it, vi } from 'vitest';
import { AgentApiError, AgentClient } from './agent-client.js';
import type { ModelSpendRow } from './types.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AgentClient', () => {
  it('hits the governance spend/model route with from/to and same-origin credentials', async () => {
    const rows: ModelSpendRow[] = [
      { modelId: 'gpt-4o', requests: 1, inputTokens: 10, outputTokens: 5, costUsd: 0.5 },
    ];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(rows));
    const client = new AgentClient({ baseUrl: '/agent', fetch: fetchMock });

    const result = await client.spendByModel({ fromDay: '2026-03-01', toDay: '2026-03-07' });

    expect(result).toEqual(rows);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/agent/governance/spend/model?from=2026-03-01&to=2026-03-07');
    expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin' });
  });

  it('maps each read to its real route', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([])));
    const client = new AgentClient({ baseUrl: '/agent', fetch: fetchMock, limit: 10 });
    const range = { fromDay: '2026-03-01', toDay: '2026-03-01' };

    await client.spendByActor(range);
    await client.usageTrend(range);
    await client.recentToolCalls();
    await client.recentThreads();
    fetchMock.mockResolvedValueOnce(jsonResponse({ usedTokens: 0 }));
    await client.quotaToday();

    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      '/agent/governance/spend/actor?from=2026-03-01&to=2026-03-01',
      '/agent/governance/usage/trend?from=2026-03-01&to=2026-03-01',
      '/agent/governance/tool-calls/recent?limit=10',
      '/agent/governance/threads/recent?limit=10',
      '/agent/quota/today',
    ]);
  });

  it('throws AgentApiError carrying the status on a non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 401));
    const client = new AgentClient({ baseUrl: '/agent', fetch: fetchMock });

    await expect(
      client.spendByModel({ fromDay: '2026-03-01', toDay: '2026-03-01' }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      client.spendByModel({ fromDay: '2026-03-01', toDay: '2026-03-01' }),
    ).rejects.toBeInstanceOf(AgentApiError);
  });
});

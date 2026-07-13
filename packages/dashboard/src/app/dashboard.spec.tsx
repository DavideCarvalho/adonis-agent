import { render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentClient } from '../client/agent-client.js';
import type {
  ActorSpendRow,
  ModelSpendRow,
  ThreadActivityRow,
  ToolCallActivityRow,
  UsageTrendPoint,
} from '../client/types.js';
import { Overview } from './Overview.js';
import { ThreadsSection } from './ThreadsSection.js';
import { ToolCallsSection } from './ToolCallsSection.js';
import { AgentClientContext } from './use-governance.js';

const RANGE = { fromDay: '2026-03-01', toDay: '2026-03-07' };

const modelRows: ModelSpendRow[] = [
  { modelId: 'gpt-4o', requests: 4, inputTokens: 4000, outputTokens: 1000, costUsd: 12.5 },
  {
    modelId: 'arn:aws:bedrock:us-east-1:1:inference-profile/us.anthropic.claude-haiku',
    requests: 9,
    inputTokens: 8000,
    outputTokens: 800,
    costUsd: 3.2,
  },
];
const actorRows: ActorSpendRow[] = [
  { actorRef: 'user:alice', requests: 7, totalTokens: 9000, costUsd: 10 },
  { actorRef: 'user:bob', requests: 6, totalTokens: 4600, costUsd: 5.7 },
];
const trendPoints: UsageTrendPoint[] = [
  { day: '2026-03-01', totalTokens: 3000, costUsd: 4 },
  { day: '2026-03-02', totalTokens: 5800, costUsd: 8 },
];
const threadRows: ThreadActivityRow[] = [
  {
    threadId: 'thread-abc12345',
    title: 'Refund request',
    actorRef: 'user:alice',
    messageCount: 5,
    totalTokens: 4200,
    lastActivityAt: '2026-03-07T10:00:00.000Z',
  },
];
const toolCallRows: ToolCallActivityRow[] = [
  {
    toolCallId: 'call-1',
    toolName: 'search_orders',
    toolType: 'function',
    status: 'completed',
    threadId: 'thread-abc12345',
    createdAt: '2026-03-07T10:01:00.000Z',
  },
];

function fakeClient(overrides: Partial<AgentClient> = {}): AgentClient {
  return {
    spendByModel: vi.fn().mockResolvedValue(modelRows),
    spendByActor: vi.fn().mockResolvedValue(actorRows),
    usageTrend: vi.fn().mockResolvedValue(trendPoints),
    recentThreads: vi.fn().mockResolvedValue(threadRows),
    recentToolCalls: vi.fn().mockResolvedValue(toolCallRows),
    quotaToday: vi.fn().mockResolvedValue({ usedTokens: 123 }),
    ...overrides,
  } as unknown as AgentClient;
}

function renderWith(client: AgentClient, ui: ReactNode) {
  return render(
    <StrictMode>
      <AgentClientContext.Provider value={client}>{ui}</AgentClientContext.Provider>
    </StrictMode>,
  );
}

afterEach(() => vi.clearAllMocks());

describe('Overview', () => {
  it('renders spend-by-model, trend, and spend-by-actor from mocked governance responses', async () => {
    const client = fakeClient();
    renderWith(client, <Overview range={RANGE} />);

    // Spend-by-model shows the plain id and the shortened Bedrock label (each appears in both the
    // legend and the table, hence getAllByText).
    await waitFor(() => expect(screen.getAllByText('gpt-4o').length).toBeGreaterThan(0));
    expect(screen.getAllByText('claude-haiku').length).toBeGreaterThan(0);

    // Headline total spend = 12.5 + 3.2 = $15.70 (appears in the stat and donut center).
    expect(screen.getAllByText('$15.70').length).toBeGreaterThan(0);

    // Spend-by-actor rows.
    expect(screen.getByText('user:alice')).toBeTruthy();
    expect(screen.getByText('user:bob')).toBeTruthy();

    // Called the real routes with the selected range.
    expect(client.spendByModel).toHaveBeenCalledWith(RANGE);
    expect(client.usageTrend).toHaveBeenCalledWith(RANGE);
    expect(client.spendByActor).toHaveBeenCalledWith(RANGE);
  });

  it('shows an empty state when there is no usage', async () => {
    const client = fakeClient({
      spendByModel: vi.fn().mockResolvedValue([]),
      spendByActor: vi.fn().mockResolvedValue([]),
      usageTrend: vi.fn().mockResolvedValue([]),
    } as Partial<AgentClient>);
    renderWith(client, <Overview range={RANGE} />);
    await waitFor(() => expect(screen.getByText('No usage recorded in this range.')).toBeTruthy());
  });

  it('surfaces a load error', async () => {
    const client = fakeClient({
      spendByModel: vi.fn().mockRejectedValue(new Error('boom')),
    } as Partial<AgentClient>);
    renderWith(client, <Overview range={RANGE} />);
    await waitFor(() => expect(screen.getByText(/Failed to load: boom/)).toBeTruthy());
  });
});

describe('ThreadsSection', () => {
  it('lists recent threads from threads/recent', async () => {
    const client = fakeClient();
    renderWith(client, <ThreadsSection />);
    await waitFor(() => expect(screen.getByText('Refund request')).toBeTruthy());
    expect(client.recentThreads).toHaveBeenCalled();
  });
});

describe('ToolCallsSection', () => {
  it('lists recent tool calls with a status pill', async () => {
    const client = fakeClient();
    renderWith(client, <ToolCallsSection />);
    await waitFor(() => expect(screen.getByText('search_orders')).toBeTruthy());
    expect(screen.getByText('completed')).toBeTruthy();
    expect(client.recentToolCalls).toHaveBeenCalled();
  });
});

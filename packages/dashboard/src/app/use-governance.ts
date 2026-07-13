import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AgentClient } from '../client/agent-client.js';
import type { GovernanceRange } from '../client/types.js';

/**
 * The {@link AgentClient} the hooks call, provided at the app root. A default instance (deriving its
 * API base from the page) is used when no provider wraps the tree — tests inject a fake via the
 * exported context.
 */
export const AgentClientContext = createContext<AgentClient | null>(null);

export function useAgentClient(): AgentClient {
  const injected = useContext(AgentClientContext);
  // Lazily build one default client per hook-tree when nothing is injected.
  const fallback = useRef<AgentClient | null>(null);
  if (injected) return injected;
  if (fallback.current === null) fallback.current = new AgentClient();
  return fallback.current;
}

/** The lifecycle of one async read. */
export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** Re-run the fetch (e.g. a manual refresh). */
  reload: () => void;
}

/**
 * A tiny dependency-free `useQuery`: runs `run` on mount and whenever `deps` change, tracks
 * loading/error, and ignores a resolved response from a superseded call (last-write-wins) so a fast
 * range change never flashes stale data. No caching — the console is a live read surface.
 */
export function useAsync<T>(run: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const runRef = useRef(run);
  runRef.current = run;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are the intentional trigger set.
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    runRef
      .current()
      .then((value) => {
        if (live) {
          setData(value);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (live) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [...deps, nonce]);

  return { data, loading, error, reload };
}

const rangeKey = (range: GovernanceRange) => `${range.fromDay}:${range.toDay}`;

export function useSpendByModel(range: GovernanceRange) {
  const client = useAgentClient();
  return useAsync(() => client.spendByModel(range), [client, rangeKey(range)]);
}

export function useSpendByActor(range: GovernanceRange) {
  const client = useAgentClient();
  return useAsync(() => client.spendByActor(range), [client, rangeKey(range)]);
}

export function useUsageTrend(range: GovernanceRange) {
  const client = useAgentClient();
  return useAsync(() => client.usageTrend(range), [client, rangeKey(range)]);
}

export function useRecentThreads(limit = 20) {
  const client = useAgentClient();
  return useAsync(() => client.recentThreads(limit), [client, limit]);
}

export function useRecentToolCalls(limit = 20) {
  const client = useAgentClient();
  return useAsync(() => client.recentToolCalls(limit), [client, limit]);
}

export function useQuotaToday() {
  const client = useAgentClient();
  return useAsync(() => client.quotaToday(), [client]);
}

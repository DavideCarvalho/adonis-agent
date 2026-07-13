import { formatCount, formatTimestamp } from '../client/format.js';
import { AsyncBlock, Panel, SectionTitle } from './ui.js';
import { useRecentThreads } from './use-governance.js';

/** Newest-first recent threads with message count + rolled-up token total, from `threads/recent`. */
export function ThreadsSection({ limit = 25 }: { limit?: number }) {
  const threads = useRecentThreads(limit);
  return (
    <Panel>
      <SectionTitle title="Recent threads" hint="newest first" />
      <AsyncBlock
        state={threads}
        isEmpty={(rows) => rows.length === 0}
        empty="No threads yet."
        skeletonRows={6}
      >
        {(rows) => (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Thread</th>
                  <th>Actor</th>
                  <th className="num">Messages</th>
                  <th className="num">Tokens</th>
                  <th className="num">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.threadId}>
                    <td title={row.threadId}>
                      {row.title || <span className="muted">untitled</span>}
                    </td>
                    <td className="mono muted" title={row.actorRef}>
                      {row.actorRef}
                    </td>
                    <td className="num mono tnum">{formatCount(row.messageCount)}</td>
                    <td className="num mono tnum">{formatCount(row.totalTokens)}</td>
                    <td className="num mono tnum muted">{formatTimestamp(row.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncBlock>
    </Panel>
  );
}

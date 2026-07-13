import { formatTimestamp } from '../client/format.js';
import { AsyncBlock, Panel, SectionTitle, StatusPill } from './ui.js';
import { useRecentToolCalls } from './use-governance.js';

/** Newest-first recent tool-call activity feed, from `tool-calls/recent`. */
export function ToolCallsSection({ limit = 25 }: { limit?: number }) {
  const calls = useRecentToolCalls(limit);
  return (
    <Panel>
      <SectionTitle title="Recent tool calls" hint="newest first" />
      <AsyncBlock
        state={calls}
        isEmpty={(rows) => rows.length === 0}
        empty="No tool calls yet."
        skeletonRows={6}
      >
        {(rows) => (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Thread</th>
                  <th className="num">When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.toolCallId}>
                    <td className="mono">{row.toolName}</td>
                    <td className="muted">{row.toolType}</td>
                    <td>
                      <StatusPill status={row.status} />
                    </td>
                    <td className="mono muted" title={row.threadId}>
                      {row.threadId ? `${row.threadId.slice(0, 8)}…` : '—'}
                    </td>
                    <td className="num mono tnum muted">{formatTimestamp(row.createdAt)}</td>
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

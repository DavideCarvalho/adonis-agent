import { useState } from 'react';
import { formatTimestamp } from '../client/format.js';
import type { PendingApprovalRow } from '../client/types.js';
import { AsyncBlock, Panel, SectionTitle } from './ui.js';
import { useAgentClient, usePendingApprovals } from './use-governance.js';

/** Render a tool-call input payload as compact one-line JSON (`—` when absent). */
function payload(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * The cross-thread HITL approvals inbox from `GET /agent/governance/approvals/pending` (oldest first).
 * Approve / reject wire to the EXISTING mutating routes `POST /agent/tool-call/approve` and
 * `POST /agent/tool-call/reject` (`{ runId, toolCallId }`), then reload the inbox so the drained call
 * drops off. A row whose `runId` is unknown (recorded before run tracking) can't be actioned, so its
 * buttons are disabled.
 */
export function ApprovalsSection() {
  const client = useAgentClient();
  const approvals = usePendingApprovals();
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const decide = async (row: PendingApprovalRow, action: 'approve' | 'reject') => {
    if (row.runId === null) return;
    setBusy((b) => ({ ...b, [row.toolCallId]: true }));
    try {
      if (action === 'approve') await client.approveToolCall(row.runId, row.toolCallId);
      else await client.rejectToolCall(row.runId, row.toolCallId);
      approvals.reload();
    } finally {
      setBusy((b) => ({ ...b, [row.toolCallId]: false }));
    }
  };

  return (
    <Panel>
      <SectionTitle title="Approvals" hint="pending HITL decisions · oldest first" />
      <AsyncBlock
        state={approvals}
        isEmpty={(rows) => rows.length === 0}
        empty="No tool calls awaiting approval."
        skeletonRows={5}
      >
        {(rows) => (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Input</th>
                  <th>Actor</th>
                  <th>Thread</th>
                  <th className="num">Requested</th>
                  <th className="num">Decision</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const disabled = row.runId === null || busy[row.toolCallId] === true;
                  return (
                    <tr key={row.toolCallId}>
                      <td className="mono">{row.toolName}</td>
                      <td className="mono muted" title={payload(row.input)}>
                        {payload(row.input).slice(0, 48)}
                      </td>
                      <td className="mono muted" title={row.actorRef}>
                        {row.actorRef}
                      </td>
                      <td className="mono muted" title={row.threadId}>
                        {row.threadId ? `${row.threadId.slice(0, 8)}…` : '—'}
                      </td>
                      <td className="num mono tnum muted">{formatTimestamp(row.requestedAt)}</td>
                      <td className="num">
                        <span className="rowbtns">
                          <button
                            type="button"
                            className="btn approve"
                            disabled={disabled}
                            onClick={() => decide(row, 'approve')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn reject"
                            disabled={disabled}
                            onClick={() => decide(row, 'reject')}
                          >
                            Reject
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AsyncBlock>
    </Panel>
  );
}

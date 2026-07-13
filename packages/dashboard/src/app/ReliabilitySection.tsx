import { formatCount, formatDuration, formatPercent } from '../client/format.js';
import type { RunReliability } from '../client/types.js';
import { AsyncBlock, Panel, SectionTitle, ShareBar, Stat } from './ui.js';
import { useReliability } from './use-governance.js';

/** One outcome slice of the reliability donut, with its semantic CSS colour token. */
interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * A hand-rolled inline-SVG donut of run outcomes (no chart library) — each slice is a
 * `stroke-dasharray` arc on a ring rotated -90° so the first slice starts at 12 o'clock, mirroring
 * the Overview {@link Donut} but coloured by semantic outcome tokens (`--good`/`--bad`/`--warn`/
 * `--info`) rather than the categorical palette. The total run count sits in the hole.
 */
function ReliabilityDonut({ slices, total }: { slices: Slice[]; total: number }) {
  const size = 168;
  const thickness = 20;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  let offset = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="run outcomes"
    >
      <title>run outcomes</title>
      <g transform={`rotate(-90 ${center} ${center})`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={thickness}
        />
        {total > 0 &&
          slices.map((slice) => {
            const fraction = slice.value / total;
            const dash = fraction * circumference;
            const el = (
              <circle
                key={slice.key}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference}`}
                strokeDashoffset={-offset * circumference}
                strokeLinecap="butt"
              />
            );
            offset += fraction;
            return el;
          })}
      </g>
      <text
        x={center}
        y={center - 3}
        textAnchor="middle"
        className="mono tnum"
        fontSize="18"
        fontWeight="600"
        fill="var(--text)"
      >
        {formatCount(total)}
      </text>
      <text
        x={center}
        y={center + 15}
        textAnchor="middle"
        className="mono"
        fontSize="10"
        fill="var(--muted)"
      >
        runs
      </text>
    </svg>
  );
}

/**
 * The run reliability surface from `GET /agent/governance/reliability`: success / failure / cancel
 * rates + mean settled duration, shown as headline stats, a hand-rolled outcome donut with a legend,
 * and per-rate bars.
 */
export function ReliabilitySection() {
  const reliability = useReliability();
  return (
    <Panel>
      <SectionTitle title="Reliability" hint="run outcomes over all time" />
      <AsyncBlock
        state={reliability}
        isEmpty={(r: RunReliability) => r.runs === 0}
        empty="No runs recorded yet."
        skeletonRows={4}
      >
        {(r) => {
          const slices: Slice[] = [
            { key: 'completed', label: 'Completed', value: r.completed, color: 'var(--good)' },
            { key: 'failed', label: 'Failed', value: r.failed, color: 'var(--bad)' },
            { key: 'cancelled', label: 'Cancelled', value: r.cancelled, color: 'var(--warn)' },
            { key: 'running', label: 'Running', value: r.running, color: 'var(--info)' },
          ];
          return (
            <div className="stack">
              <div className="grid stat-4">
                <Stat
                  label="Runs"
                  value={formatCount(r.runs)}
                  sub={`${formatCount(r.running)} running`}
                />
                <Stat
                  label="Success rate"
                  value={formatPercent(r.successRate)}
                  sub={`${formatCount(r.completed)} completed`}
                />
                <Stat
                  label="Failure rate"
                  value={formatPercent(r.failureRate)}
                  sub={`${formatCount(r.failed)} failed`}
                />
                <Stat
                  label="Avg duration"
                  value={formatDuration(r.avgDurationMs)}
                  sub="settled runs"
                />
              </div>

              <div className="grid cols-2" style={{ alignItems: 'center' }}>
                <div style={{ display: 'grid', placeItems: 'center', gap: 14 }}>
                  <ReliabilityDonut slices={slices} total={r.runs} />
                  <div className="legend" style={{ width: '100%' }}>
                    {slices.map((slice) => (
                      <div className="row" key={slice.key}>
                        <span className="swatch" style={{ background: slice.color }} />
                        <span className="name">{slice.label}</span>
                        <span className="mono tnum muted">{formatCount(slice.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Outcome</th>
                        <th className="num">Rate</th>
                        <th style={{ width: 160 }}>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Success</td>
                        <td className="num mono tnum">{formatPercent(r.successRate)}</td>
                        <td>
                          <ShareBar fraction={r.successRate} color="var(--good)" />
                        </td>
                      </tr>
                      <tr>
                        <td>Failure</td>
                        <td className="num mono tnum">{formatPercent(r.failureRate)}</td>
                        <td>
                          <ShareBar fraction={r.failureRate} color="var(--bad)" />
                        </td>
                      </tr>
                      <tr>
                        <td>Cancel</td>
                        <td className="num mono tnum">{formatPercent(r.cancelRate)}</td>
                        <td>
                          <ShareBar fraction={r.cancelRate} color="var(--warn)" />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        }}
      </AsyncBlock>
    </Panel>
  );
}

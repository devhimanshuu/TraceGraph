'use client';

import { useId } from 'react';
import type { ImpactSnapshot } from '@/lib/impact-history';

type Score = ImpactSnapshot['score'];

const LEVEL: Record<Score, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const COLOR: Record<Score, string> = {
  LOW: '#34d399',
  MEDIUM: '#fbbf24',
  HIGH: '#fb7185',
};

const LEVELS: Score[] = ['LOW', 'MEDIUM', 'HIGH'];

export function scoreToLevel(score: Score): number {
  return LEVEL[score];
}

/**
 * A tiny sparkline of one entity's impact score across its recorded runs
 * (oldest → newest). Scores are categorical (LOW/MEDIUM/HIGH), so the chart
 * is a stepped level line with per-run dots colored by score — purely
 * descriptive, no axes, readable at a glance.
 */
export function ImpactHistoryTrend({ snapshots }: { snapshots: ImpactSnapshot[] }) {
  const ordered = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
  const grad = useId();
  if (ordered.length === 0) return null;

  const W = 150;
  const H = 48;
  const PAD_X = 16;
  const PAD_Y = 8;
  const innerW = W - PAD_X - 6;
  const innerH = H - PAD_Y * 2;

  const xAt = (i: number) =>
    PAD_X + (ordered.length === 1 ? innerW / 2 : (i * innerW) / (ordered.length - 1));
  const yAt = (level: number) => H - PAD_Y - (level / 2) * (innerH - 10) - 5;

  const points = ordered.map((s, i) => ({
    x: xAt(i),
    y: yAt(LEVEL[s.score]),
    score: s.score,
  }));

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const lastX = xAt(ordered.length - 1);
  const baseY = H - PAD_Y;

  return (
    <div className="flex items-center gap-3" data-testid="impact-history-trend">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Score history: ${ordered.map((s) => s.score).join(' → ')}`}
      >
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fb7185" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* Score-level gridlines + L/M/H markers */}
        {LEVELS.map((level) => (
          <g key={level}>
            <line
              x1={PAD_X}
              x2={W - 4}
              y1={yAt(LEVEL[level])}
              y2={yAt(LEVEL[level])}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <text
              x={2}
              y={yAt(LEVEL[level]) + 3}
              fontSize="7"
              fill="var(--muted-foreground)"
              fontFamily="monospace"
            >
              {level[0]}
            </text>
          </g>
        ))}

        {/* Area under the trend */}
        <path d={`${path} L${lastX.toFixed(1)},${baseY} L${xAt(0).toFixed(1)},${baseY} Z`} fill={`url(#${grad})`} />

        {/* Score line */}
        <path
          d={path}
          fill="none"
          stroke="#94a3b8"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Per-run dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            fill={COLOR[p.score]}
            stroke="var(--background)"
            strokeWidth="1"
          />
        ))}
      </svg>

      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-medium text-foreground">Score history</span>
        <span className="text-[10px] text-muted-foreground">
          {ordered.length} {ordered.length === 1 ? 'run' : 'runs'} · {ordered[0].score} →{' '}
          {ordered[ordered.length - 1].score}
        </span>
      </div>
    </div>
  );
}

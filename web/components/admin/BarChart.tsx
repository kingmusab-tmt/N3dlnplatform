'use client';
// Single-series column chart with a hover/focus tooltip and a table view.
// Marks: <=24px columns, 4px rounded tops square on the baseline, 2px gaps,
// hairline gridlines; one hue validated for the dark surface (#0284c7).
import { useEffect, useRef, useState } from 'react';

export type BarDatum = {
  key: string;
  /** Axis label, e.g. "12 Oct". */
  label: string;
  value: number;
  /** Tooltip / table rows beyond the main value, e.g. [["Visits", "14"]]. */
  details?: [string, string][];
};

const BAR = '#0284c7';
const BAR_HOVER = '#0ea5e9';
const GRID = '#1e293b';
const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 26, left: 40 };

/** 0 / 5 / 10 / 15 / 20 style ticks with a clean top. */
function niceTicks(max: number) {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const stepInt = Math.max(1, Math.ceil(step));
  const ticks = [];
  for (let v = 0; v < max + stepInt; v += stepInt) ticks.push(v);
  return ticks;
}

export default function BarChart({
  data,
  valueName,
  ariaLabel,
}: {
  data: BarDatum[];
  /** What the bars measure, e.g. "Visitors". */
  valueName: string;
  ariaLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(24, slot - 2));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(plotW / 64)));
  const hovered = active !== null ? data[active] : null;

  return (
    <div className="min-w-0">
      {/* overflow-hidden + min-w-0: the SVG never props its container open, so it can shrink on phones. */}
      <div ref={wrapRef} className="relative w-full min-w-0 overflow-hidden">
        <svg width={width} height={HEIGHT} role="img" aria-label={ariaLabel} className="block select-none">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-slate-500 text-[11px] tabular-nums">
                {t >= 1000 ? `${t / 1000}K` : t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const h = Math.max(0, y(0) - y(d.value));
            const r = Math.min(4, barW / 2, h);
            const x = cx - barW / 2;
            const yTop = y(0) - h;
            // Rounded data end, square at the baseline.
            const path =
              h > 0
                ? `M${x},${y(0)} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${y(0)} Z`
                : '';
            return (
              <g key={d.key}>
                {path && <path d={path} fill={active === i ? BAR_HOVER : BAR} />}
                {i % labelEvery === 0 && (
                  <text x={cx} y={HEIGHT - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
                    {d.label}
                  </text>
                )}
                {/* Hit target: the whole column, bigger than the bar. */}
                <rect
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.label}: ${d.value} ${valueName.toLowerCase()}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="outline-none focus-visible:stroke-sky-300"
                />
              </g>
            );
          })}
        </svg>
        {hovered && active !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 w-40 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs shadow-xl"
            style={{
              // Beside the bar, never on top of it: right of it, or left near the right edge.
              left:
                PAD.left + slot * (active + 1) + 8 + 160 <= width
                  ? PAD.left + slot * (active + 1) + 8
                  : Math.max(0, PAD.left + slot * active - 8 - 160),
              top: Math.min(Math.max(0, y(hovered.value) - 20), HEIGHT - 100),
            }}
          >
            <p className="font-medium text-slate-100">{hovered.label}</p>
            <p className="mt-1 flex justify-between gap-4 text-slate-300">
              <span>{valueName}</span>
              <span className="tabular-nums text-slate-100">{hovered.value.toLocaleString('en-NG')}</span>
            </p>
            {hovered.details?.map(([k, v]) => (
              <p key={k} className="flex justify-between gap-4 text-slate-400">
                <span>{k}</span>
                <span className="tabular-nums">{v}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setShowTable((s) => !s)}
        aria-expanded={showTable}
        className="mt-2 text-xs text-slate-400 underline hover:text-slate-200"
      >
        {showTable ? 'Hide table' : 'Show as table'}
      </button>
      {showTable && (
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-900 text-slate-400">
              <tr>
                <th className="px-3 py-1.5 font-medium">Period</th>
                <th className="px-3 py-1.5 text-right font-medium">{valueName}</th>
                {data[0]?.details?.map(([k]) => (
                  <th key={k} className="px-3 py-1.5 text-right font-medium">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums text-slate-300">
              {data.map((d) => (
                <tr key={d.key} className="border-t border-white/5">
                  <td className="px-3 py-1">{d.label}</td>
                  <td className="px-3 py-1 text-right">{d.value.toLocaleString('en-NG')}</td>
                  {d.details?.map(([k, v]) => (
                    <td key={k} className="px-3 py-1 text-right">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

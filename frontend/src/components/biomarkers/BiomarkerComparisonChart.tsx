import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  type TooltipProps,
} from 'recharts';
import { formatBiomarkerType } from '@/utils/format';
import type { BiomarkerRecord } from '@/types/api';

// ─── Color palette for up to 6 overlaid lines ───────────────
export const LINE_COLORS = [
  '#06b6d4', // cyan-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#ef4444', // red-500
  '#ec4899', // pink-500
];

// ─── Types ───────────────────────────────────────────────────

interface ComparisonChartProps {
  records: BiomarkerRecord[];
  selectedTypes: string[];
}

interface NormalizedPoint {
  date: string;
  formattedDate: string;
  timestamp: number;
  [key: string]: number | string; // biomarkerType → normalized value
}

// ─── Helpers ─────────────────────────────────────────────────

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Normalize a biomarker value to a 0–100 scale relative to its reference range.
 * 50 = midpoint of reference range (ideal).
 * Values outside the range map to <0 or >100.
 */
function normalize(
  value: number,
  low: number,
  high: number,
): number {
  const range = high - low;
  if (range === 0) return 50;
  return ((value - low) / range) * 100;
}

// ─── Custom Tooltip ──────────────────────────────────────────

function ComparisonTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="glass-heavy rounded-xl px-4 py-3 shadow-glass-lg min-w-[180px]">
      <p className="text-xs text-slate-400 font-medium mb-2">{label}</p>
      <div className="space-y-1.5">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-xs font-medium text-slate-600">
                {formatBiomarkerType(entry.dataKey as string)}
              </span>
            </div>
            <span className="text-xs font-bold text-slate-800 font-mono">
              {typeof entry.value === 'number' ? entry.value.toFixed(0) : '—'}%
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-300">
        50% = midpoint of reference range
      </p>
    </div>
  );
}

// ─── Custom Legend ────────────────────────────────────────────

function ComparisonLegend({
  selectedTypes,
}: {
  selectedTypes: string[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
      {selectedTypes.map((type, i) => (
        <div key={type} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}
          />
          <span className="text-xs font-medium text-slate-500">
            {formatBiomarkerType(type)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export function BiomarkerComparisonChart({
  records,
  selectedTypes,
}: ComparisonChartProps) {
  const chartData = useMemo(() => {
    if (selectedTypes.length === 0) return [];

    // Build reference range map from latest record of each type
    const refRanges = new Map<string, { low: number; high: number }>();
    for (const r of records) {
      if (selectedTypes.includes(r.biomarkerType)) {
        refRanges.set(r.biomarkerType, {
          low: r.referenceRangeLow,
          high: r.referenceRangeHigh,
        });
      }
    }

    // Group records by date, normalize, and merge
    const dateMap = new Map<string, NormalizedPoint>();

    for (const r of records) {
      if (!selectedTypes.includes(r.biomarkerType)) continue;
      const range = refRanges.get(r.biomarkerType);
      if (!range) continue;

      const dateKey = r.createdAt.slice(0, 10); // YYYY-MM-DD
      const existing = dateMap.get(dateKey) ?? {
        date: r.createdAt,
        formattedDate: formatShortDate(r.createdAt),
        timestamp: new Date(r.createdAt).getTime(),
      };

      existing[r.biomarkerType] = normalize(r.value, range.low, range.high);
      dateMap.set(dateKey, existing);
    }

    return Array.from(dateMap.values()).sort(
      (a, b) => (a.timestamp as number) - (b.timestamp as number),
    );
  }, [records, selectedTypes]);

  if (selectedTypes.length === 0) {
    return (
      <div className="flex h-[350px] items-center justify-center text-sm text-slate-400">
        Select biomarkers above to compare trends.
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex h-[350px] items-center justify-center text-sm text-slate-400">
        No data points for the selected biomarkers.
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
        >
          <defs>
            {selectedTypes.map((type, i) => (
              <linearGradient
                key={type}
                id={`comp-${type}`}
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop
                  offset="0%"
                  stopColor={LINE_COLORS[i % LINE_COLORS.length]}
                  stopOpacity={0.4}
                />
                <stop
                  offset="100%"
                  stopColor={LINE_COLORS[i % LINE_COLORS.length]}
                  stopOpacity={1}
                />
              </linearGradient>
            ))}
          </defs>

          {/* Reference band: 0-100 is the "normal" range */}
          <ReferenceLine
            y={0}
            stroke="rgba(148, 163, 184, 0.2)"
            strokeDasharray="4 4"
            label={{ value: 'Low', fill: '#94a3b8', fontSize: 10, position: 'left' }}
          />
          <ReferenceLine
            y={50}
            stroke="rgba(6, 182, 212, 0.15)"
            strokeDasharray="4 4"
            label={{ value: 'Ideal', fill: '#06b6d4', fontSize: 10, position: 'left' }}
          />
          <ReferenceLine
            y={100}
            stroke="rgba(148, 163, 184, 0.2)"
            strokeDasharray="4 4"
            label={{ value: 'High', fill: '#94a3b8', fontSize: 10, position: 'left' }}
          />

          <XAxis
            dataKey="formattedDate"
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(148, 163, 184, 0.15)' }}
          />

          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(148, 163, 184, 0.15)' }}
            width={45}
            tickFormatter={(v: number) => `${v}%`}
            domain={[-20, 120]}
          />

          <Tooltip content={<ComparisonTooltip />} />
          <Legend content={() => null} />

          {selectedTypes.map((type, i) => (
            <Line
              key={type}
              type="monotone"
              dataKey={type}
              name={formatBiomarkerType(type)}
              stroke={`url(#comp-${type})`}
              strokeWidth={2.5}
              dot={{
                r: 4,
                fill: LINE_COLORS[i % LINE_COLORS.length],
                strokeWidth: 2,
                stroke: '#fff',
              }}
              activeDot={{
                r: 6,
                fill: LINE_COLORS[i % LINE_COLORS.length],
                strokeWidth: 3,
                stroke: '#fff',
              }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <ComparisonLegend selectedTypes={selectedTypes} />
    </div>
  );
}

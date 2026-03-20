import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { formatBiomarkerType, formatValue } from '@/utils/format';

interface SparklineDataPoint {
  value: number;
  createdAt: string;
}

interface BiomarkerSparklineProps {
  data: SparklineDataPoint[];
  status: string;
  biomarkerType: string;
  unit: string;
}

function getLineColor(status: string): string {
  switch (status) {
    case 'OPTIMAL':
      return '#10b981'; // emerald-500
    case 'NORMAL':
      return '#06b6d4'; // primary-500
    case 'BORDERLINE':
      return '#f59e0b'; // amber-500
    case 'OUT_OF_RANGE':
      return '#ef4444'; // red-500
    default:
      return '#94a3b8'; // slate-400
  }
}

function getTrendArrow(data: SparklineDataPoint[]): string {
  if (data.length < 2) return '\u2192';
  const prev = data[data.length - 2]!.value;
  const curr = data[data.length - 1]!.value;
  const delta = curr - prev;
  const threshold = Math.abs(prev) * 0.02;

  if (delta > threshold) return '\u2191';
  if (delta < -threshold) return '\u2193';
  return '\u2192';
}

export function BiomarkerSparkline({
  data,
  status,
  biomarkerType,
  unit,
}: BiomarkerSparklineProps) {
  const latestValue = data.length > 0 ? data[data.length - 1]!.value : null;
  const lineColor = getLineColor(status);
  const trendArrow = getTrendArrow(data);

  return (
    <div className="card flex items-center gap-3 px-4 py-3.5 group">
      {/* Label + value */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-700">
          {formatBiomarkerType(biomarkerType)}
        </p>
        <p className="text-xs text-slate-400 font-medium mt-0.5">
          {latestValue !== null ? formatValue(latestValue, unit) : '\u2014'}{' '}
          <span className="ml-0.5 transition-transform inline-block group-hover:scale-110" style={{ color: lineColor }}>
            {trendArrow}
          </span>
        </p>
      </div>

      {/* Sparkline */}
      <div className="h-10 w-[120px] flex-shrink-0">
        {data.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <defs>
                <linearGradient id={`spark-${biomarkerType}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={1} />
                </linearGradient>
              </defs>
              <Line
                type="monotone"
                dataKey="value"
                stroke={`url(#spark-${biomarkerType})`}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-300">
            Not enough data
          </div>
        )}
      </div>
    </div>
  );
}

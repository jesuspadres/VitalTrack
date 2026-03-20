import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import { getStatusColor } from '@/utils/format';

interface ChartDataPoint {
  value: number;
  createdAt: string;
  status: string;
}

interface BiomarkerChartProps {
  data: ChartDataPoint[];
  referenceRangeLow: number;
  referenceRangeHigh: number;
  unit: string;
}

interface ChartPayload {
  value: number;
  date: string;
  formattedDate: string;
  status: string;
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function CustomTooltip({
  active,
  payload,
}: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]?.payload as ChartPayload | undefined;
  if (!data) return null;

  const statusColorClass = getStatusColor(data.status);

  return (
    <div className="glass-heavy rounded-xl px-3.5 py-2.5 shadow-glass-lg">
      <p className="text-xs text-slate-400 font-medium">{data.formattedDate}</p>
      <p className="mt-1 text-sm font-bold text-slate-800">
        {data.value} {(payload[0]?.name as string) ?? ''}
      </p>
      <p className={`mt-0.5 text-xs font-semibold ${statusColorClass}`}>
        {data.status.replace(/_/g, ' ')}
      </p>
    </div>
  );
}

export function BiomarkerChart({
  data,
  referenceRangeLow,
  referenceRangeHigh,
  unit,
}: BiomarkerChartProps) {
  const sortedData = [...data]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((point) => ({
      value: point.value,
      date: point.createdAt,
      formattedDate: formatShortDate(point.createdAt),
      status: point.status,
    }));

  if (sortedData.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-slate-400">
        No data points to display.
      </div>
    );
  }

  const allValues = sortedData.map((d) => d.value);
  const minValue = Math.min(...allValues, referenceRangeLow);
  const maxValue = Math.max(...allValues, referenceRangeHigh);
  const padding = (maxValue - minValue) * 0.15 || 5;
  const yMin = Math.max(0, Math.floor(minValue - padding));
  const yMax = Math.ceil(maxValue + padding);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={sortedData}
        margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
      >
        <defs>
          <linearGradient id="chartLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity={1} />
          </linearGradient>
        </defs>

        {/* Reference range band */}
        <ReferenceArea
          y1={referenceRangeLow}
          y2={referenceRangeHigh}
          fill="#06b6d4"
          fillOpacity={0.06}
          strokeOpacity={0}
        />

        <XAxis
          dataKey="formattedDate"
          tick={{ fontSize: 12, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(148, 163, 184, 0.15)' }}
        />

        <YAxis
          domain={[yMin, yMax]}
          tick={{ fontSize: 12, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(148, 163, 184, 0.15)' }}
          width={50}
        />

        <Tooltip content={<CustomTooltip />} />

        <Line
          type="monotone"
          dataKey="value"
          name={unit}
          stroke="url(#chartLine)"
          strokeWidth={2.5}
          dot={{ r: 4, fill: '#06b6d4', strokeWidth: 2, stroke: '#fff' }}
          activeDot={{ r: 6, fill: '#06b6d4', strokeWidth: 3, stroke: '#fff' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

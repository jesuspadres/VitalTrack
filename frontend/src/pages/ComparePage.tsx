import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useBiomarkers } from '@/hooks/useBiomarkers';
import { BiomarkerComparisonChart, LINE_COLORS } from '@/components/biomarkers/BiomarkerComparisonChart';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatBiomarkerType } from '@/utils/format';
import type { BiomarkerRecord } from '@/types/api';

const MAX_SELECTED = 6;

// ─── Helpers ─────────────────────────────────────────────────

function getAvailableTypes(records: BiomarkerRecord[]): string[] {
  const typeSet = new Set<string>();
  for (const r of records) {
    typeSet.add(r.biomarkerType);
  }
  return Array.from(typeSet).sort();
}

function buildTypeStatsMap(records: BiomarkerRecord[]) {
  const map = new Map<string, { count: number; latest: BiomarkerRecord }>();
  for (const r of records) {
    const existing = map.get(r.biomarkerType);
    if (!existing) {
      map.set(r.biomarkerType, { count: 1, latest: r });
    } else {
      existing.count += 1;
      if (new Date(r.createdAt).getTime() > new Date(existing.latest.createdAt).getTime()) {
        existing.latest = r;
      }
    }
  }
  return map;
}

// ─── Page ────────────────────────────────────────────────────

export default function ComparePage() {
  const { data, isLoading, isError } = useBiomarkers();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);

  const records = useMemo(
    () => (Array.isArray(data) ? data : []),
    [data],
  );

  const availableTypes = useMemo(
    () => getAvailableTypes(records),
    [records],
  );

  const typeStatsMap = useMemo(
    () => buildTypeStatsMap(records),
    [records],
  );

  const toggleType = (type: string) => {
    setSelected((prev) => {
      if (prev.includes(type)) return prev.filter((t) => t !== type);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, type];
    });
  };

  const clearAll = () => setSelected([]);

  if (isLoading) return <DashboardSkeleton />;

  if (isError) {
    return (
      <EmptyState
        title="Something went wrong"
        description="We couldn't load your biomarker data. Please try refreshing the page."
      />
    );
  }

  if (records.length === 0) {
    return (
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-6">
          Compare Biomarkers
        </h1>
        <EmptyState
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h2l3-8 4 16 3-8h6" />
            </svg>
          }
          title="No biomarkers to compare"
          description="Upload your lab results first, then come back to see how your biomarkers relate to each other."
          action={{
            label: 'Upload Biomarkers',
            onClick: () => navigate('/upload'),
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
          Compare Biomarkers
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Overlay multiple biomarkers to spot correlations and trends. Values are
          normalized to each marker&apos;s reference range.
        </p>
      </div>

      {/* Biomarker selector */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Select Biomarkers
            <span className="ml-2 text-slate-300">
              ({selected.length}/{MAX_SELECTED} max)
            </span>
          </h2>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {availableTypes.map((type) => {
            const isSelected = selected.includes(type);
            const colorIndex = isSelected ? selected.indexOf(type) : -1;
            const stats = typeStatsMap.get(type) ?? { count: 0 };
            const isDisabled = !isSelected && selected.length >= MAX_SELECTED;

            return (
              <button
                key={type}
                type="button"
                disabled={isDisabled}
                onClick={() => toggleType(type)}
                className={clsx(
                  'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200',
                  isSelected
                    ? 'text-white shadow-md'
                    : 'glass-subtle text-slate-600 hover:bg-white/50',
                  isDisabled && !isSelected && 'opacity-40 cursor-not-allowed',
                )}
                style={
                  isSelected
                    ? {
                        background: `linear-gradient(135deg, ${LINE_COLORS[colorIndex % LINE_COLORS.length]}, ${LINE_COLORS[colorIndex % LINE_COLORS.length]}dd)`,
                        boxShadow: `0 4px 14px ${LINE_COLORS[colorIndex % LINE_COLORS.length]}40`,
                      }
                    : undefined
                }
              >
                {isSelected && (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <span>{formatBiomarkerType(type)}</span>
                <span
                  className={clsx(
                    'text-xs rounded-full px-1.5 py-0.5',
                    isSelected
                      ? 'bg-white/20 text-white/90'
                      : 'bg-white/40 text-slate-400',
                  )}
                >
                  {stats.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Normalized Trend Comparison
          </h2>
          {selected.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-500/10 border border-primary-500/15 px-3 py-1 text-xs font-semibold text-primary-600">
              {selected.length} biomarker{selected.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <BiomarkerComparisonChart records={records} selectedTypes={selected} />
      </div>

      {/* Interpretation guide */}
      <div className="card p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          How to Read This Chart
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
              <span className="text-sm font-bold text-emerald-600">50%</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Ideal Zone</p>
              <p className="text-xs text-slate-400 mt-0.5">
                50% is the midpoint of each biomarker&apos;s reference range
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
              <span className="text-xs font-bold text-amber-600">&gt;100</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Above Range</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Values above 100% exceed the reference range high
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-red-500/10">
              <span className="text-xs font-bold text-red-600">&lt;0</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Below Range</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Values below 0% fall under the reference range low
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

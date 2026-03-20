import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useBiomarkers } from '@/hooks/useBiomarkers';
import { useInsights } from '@/hooks/useInsights';
import { BiomarkerSparkline } from '@/components/dashboard/BiomarkerSparkline';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatBiomarkerType, formatDate, getScoreColor } from '@/utils/format';
import type { BiomarkerRecord } from '@/types/api';

// ─── Helpers ────────────────────────────────────────────────

function groupBiomarkersByType(records: BiomarkerRecord[]) {
  const grouped = new Map<
    string,
    { data: Array<{ value: number; createdAt: string }>; latestRecord: BiomarkerRecord }
  >();

  const sorted = [...records].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  for (const record of sorted) {
    const existing = grouped.get(record.biomarkerType);
    if (existing) {
      existing.data.push({ value: record.value, createdAt: record.createdAt });
      existing.latestRecord = record;
    } else {
      grouped.set(record.biomarkerType, {
        data: [{ value: record.value, createdAt: record.createdAt }],
        latestRecord: record,
      });
    }
  }

  for (const [, group] of grouped) {
    if (group.data.length > 5) {
      group.data = group.data.slice(-5);
    }
  }

  return grouped;
}

function getStatusCounts(groups: Map<string, { latestRecord: BiomarkerRecord }>) {
  const counts = { OPTIMAL: 0, NORMAL: 0, BORDERLINE: 0, OUT_OF_RANGE: 0 };
  for (const [, { latestRecord }] of groups) {
    const s = latestRecord.status as keyof typeof counts;
    if (s in counts) counts[s]++;
  }
  return counts;
}

// ─── Score Ring (inline, larger) ────────────────────────────

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getStrokeColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function getGlowColor(score: number): string {
  if (score >= 80) return 'rgba(16, 185, 129, 0.18)';
  if (score >= 60) return 'rgba(245, 158, 11, 0.18)';
  return 'rgba(239, 68, 68, 0.18)';
}

function ScoreLabel({ score }: { score: number }) {
  if (score >= 80) return <span className="text-emerald-600">Excellent</span>;
  if (score >= 60) return <span className="text-amber-600">Good</span>;
  return <span className="text-red-600">Needs Attention</span>;
}

// ─── Main Page ──────────────────────────────────────────────

export default function DashboardPage() {
  const {
    data: biomarkersData,
    isLoading: biomarkersLoading,
    isError: biomarkersError,
  } = useBiomarkers();

  const {
    data: insightsData,
    isLoading: insightsLoading,
    isError: insightsError,
  } = useInsights();

  const isLoading = biomarkersLoading || insightsLoading;
  const isError = biomarkersError || insightsError;

  const sortedInsights = insightsData?.insights
    ? [...insightsData.insights].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    : [];
  const latestInsight = sortedInsights[0];
  const latestScore = latestInsight?.overallScore;

  const biomarkerGroups =
    Array.isArray(biomarkersData) && biomarkersData.length > 0
      ? groupBiomarkersByType(biomarkersData)
      : new Map<string, { data: Array<{ value: number; createdAt: string }>; latestRecord: BiomarkerRecord }>();

  const statusCounts = getStatusCounts(biomarkerGroups);
  const attentionItems = Array.from(biomarkerGroups.entries()).filter(
    ([, { latestRecord }]) =>
      latestRecord.status === 'BORDERLINE' || latestRecord.status === 'OUT_OF_RANGE',
  );

  const hasScore = latestScore !== undefined;
  const offset = hasScore
    ? CIRCUMFERENCE - (latestScore / 100) * CIRCUMFERENCE
    : CIRCUMFERENCE;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Loading */}
      {isLoading && (
        <div className="mt-12">
          <LoadingSpinner size="lg" text="Loading your dashboard..." className="py-20" />
        </div>
      )}

      {/* Error */}
      {!isLoading && isError && (
        <EmptyState
          title="Something went wrong"
          description="We couldn't load your dashboard data. Please try refreshing the page."
        />
      )}

      {!isLoading && !isError && (
        <>
          {/* ── Hero: Score + Stats ─────────────────────────── */}
          <section className="card p-6">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
              {/* Score ring */}
              <div className="relative flex-shrink-0">
                {hasScore && (
                  <div
                    className="absolute inset-0 rounded-full blur-2xl transition-all duration-700"
                    style={{ background: getGlowColor(latestScore) }}
                  />
                )}
                <svg
                  width="140"
                  height="140"
                  viewBox="0 0 120 120"
                  className="relative"
                  aria-label={hasScore ? `Health score: ${latestScore}` : 'No score yet'}
                >
                  <circle
                    cx="60"
                    cy="60"
                    r={RADIUS}
                    fill="none"
                    stroke="rgba(6, 182, 212, 0.08)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r={RADIUS}
                    fill="none"
                    stroke={hasScore ? getStrokeColor(latestScore) : 'rgba(148, 163, 184, 0.15)'}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={offset}
                    transform="rotate(-90 60 60)"
                    className="transition-all duration-1000 ease-out"
                    style={{
                      filter: hasScore
                        ? `drop-shadow(0 0 8px ${getGlowColor(latestScore)})`
                        : 'none',
                    }}
                  />
                  <text
                    x="60"
                    y="56"
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      fontSize: hasScore ? '30px' : '32px',
                      fontWeight: 700,
                      fontFamily: 'Outfit, system-ui, sans-serif',
                      fill: hasScore ? getStrokeColor(latestScore) : '#cbd5e1',
                    }}
                  >
                    {hasScore ? latestScore : '\u2014'}
                  </text>
                  {hasScore && (
                    <text
                      x="60"
                      y="74"
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{
                        fontSize: '10px',
                        fontWeight: 500,
                        fontFamily: 'Outfit, system-ui, sans-serif',
                        fill: '#94a3b8',
                        letterSpacing: '0.05em',
                      }}
                    >
                      / 100
                    </text>
                  )}
                </svg>
              </div>

              {/* Stats beside the ring */}
              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                  {hasScore ? (
                    <>
                      Health Score: <ScoreLabel score={latestScore} />
                    </>
                  ) : (
                    'Welcome to VitalTrack'
                  )}
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  {hasScore
                    ? latestInsight?.summary ?? 'Based on your latest biomarker results.'
                    : 'Upload your lab results to get your health score.'}
                </p>

                {/* Quick stat chips */}
                {biomarkerGroups.size > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/8 border border-slate-500/10 px-3 py-1 text-xs font-semibold text-slate-600">
                      {biomarkerGroups.size} biomarkers tracked
                    </span>
                    {statusCounts.OPTIMAL > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {statusCounts.OPTIMAL} optimal
                      </span>
                    )}
                    {statusCounts.NORMAL > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                        {statusCounts.NORMAL} normal
                      </span>
                    )}
                    {statusCounts.BORDERLINE > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {statusCounts.BORDERLINE} borderline
                      </span>
                    )}
                    {statusCounts.OUT_OF_RANGE > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/15 px-3 py-1 text-xs font-semibold text-red-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        {statusCounts.OUT_OF_RANGE} out of range
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── Attention Needed ────────────────────────────── */}
          {attentionItems.length > 0 && (
            <section className="card border-amber-500/20 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15">
                  <svg className="h-3 w-3 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </span>
                <h2 className="text-sm font-semibold text-slate-700">
                  {attentionItems.length} biomarker{attentionItems.length > 1 ? 's' : ''} need{attentionItems.length === 1 ? 's' : ''} attention
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {attentionItems.map(([type, { latestRecord }]) => (
                  <Link
                    key={type}
                    to={`/biomarkers/${encodeURIComponent(latestRecord.sk)}`}
                    className={clsx(
                      'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all hover:scale-[1.02]',
                      latestRecord.status === 'OUT_OF_RANGE'
                        ? 'bg-red-500/8 border border-red-500/15 text-red-700'
                        : 'bg-amber-500/8 border border-amber-500/15 text-amber-700',
                    )}
                  >
                    <span className={clsx(
                      'h-2 w-2 rounded-full',
                      latestRecord.status === 'OUT_OF_RANGE' ? 'bg-red-500' : 'bg-amber-500',
                    )} />
                    <span className="font-semibold">{formatBiomarkerType(type)}</span>
                    <span className="text-xs opacity-70">
                      {latestRecord.value} {latestRecord.unit}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── Biomarker Sparklines ────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Biomarker Trends
              </h2>
              {biomarkerGroups.size > 0 && (
                <Link
                  to="/biomarkers"
                  className="text-xs font-semibold text-primary-500 hover:text-primary-600 transition-colors"
                >
                  View all &rarr;
                </Link>
              )}
            </div>
            {biomarkerGroups.size > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from(biomarkerGroups.entries()).map(
                  ([type, { data, latestRecord }], index) => (
                    <Link
                      key={type}
                      to={`/biomarkers/${encodeURIComponent(latestRecord.sk)}`}
                      className="animate-fade-in-up block"
                      style={{
                        animationDelay: `${index * 40}ms`,
                        animationFillMode: 'backwards',
                      }}
                    >
                      <BiomarkerSparkline
                        data={data}
                        status={latestRecord.status}
                        biomarkerType={latestRecord.biomarkerType}
                        unit={latestRecord.unit}
                      />
                    </Link>
                  ),
                )}
              </div>
            ) : (
              <EmptyState
                title="No biomarkers yet"
                description="Upload your lab results to start tracking your health trends."
              />
            )}
          </section>

          {/* ── Latest Insight ──────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Latest AI Insight
              </h2>
              {sortedInsights.length > 0 && (
                <Link
                  to="/insights"
                  className="text-xs font-semibold text-primary-500 hover:text-primary-600 transition-colors"
                >
                  All insights &rarr;
                </Link>
              )}
            </div>
            {latestInsight ? (
              <Link
                to={`/insights/${encodeURIComponent(latestInsight.insightId)}`}
                className="card block p-5 group"
              >
                <div className="flex items-start gap-4">
                  {/* Score pill */}
                  {latestInsight.overallScore != null && (
                    <div
                      className={clsx(
                        'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-lg font-bold',
                        latestInsight.overallScore >= 80
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : latestInsight.overallScore >= 60
                            ? 'bg-amber-500/10 text-amber-600'
                            : 'bg-red-500/10 text-red-600',
                      )}
                    >
                      {latestInsight.overallScore}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex rounded-full bg-slate-500/8 border border-slate-500/10 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                        {latestInsight.category.charAt(0) + latestInsight.category.slice(1).toLowerCase()}
                      </span>
                      <span className="text-xs text-slate-400">
                        {formatDate(latestInsight.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-600 line-clamp-2">
                      {latestInsight.summary}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-500 group-hover:gap-2 transition-all">
                      Read full analysis
                      <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
                    </span>
                  </div>
                </div>
              </Link>
            ) : (
              <EmptyState
                title="No insights yet"
                description="Upload biomarker data to generate your first AI health insight."
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}

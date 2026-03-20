import { useParams, Link } from 'react-router-dom';
import clsx from 'clsx';
import { useInsight } from '@/hooks/useInsights';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { formatDate, getScoreColor } from '@/utils/format';
import type { ActionPlanItem, RiskFlag } from '@/types/api';

// ─── Category colors (glass rgba style) ─────────────────────
const DEFAULT_CATEGORY_COLOR = {
  bg: 'bg-primary-500/10',
  text: 'text-primary-600',
  border: 'border-primary-500/15',
  dot: 'bg-primary-500',
};

const categoryColors: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  CARDIOVASCULAR: { bg: 'bg-red-500/10', text: 'text-red-600', border: 'border-red-500/15', dot: 'bg-red-500' },
  METABOLIC: { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-500/15', dot: 'bg-amber-500' },
  HORMONAL: { bg: 'bg-purple-500/10', text: 'text-purple-600', border: 'border-purple-500/15', dot: 'bg-purple-500' },
  NUTRITIONAL: { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/15', dot: 'bg-emerald-500' },
  INFLAMMATION: { bg: 'bg-orange-500/10', text: 'text-orange-600', border: 'border-orange-500/15', dot: 'bg-orange-500' },
  GENERAL: DEFAULT_CATEGORY_COLOR,
};

function getCategoryColor(category: string) {
  return categoryColors[category] ?? DEFAULT_CATEGORY_COLOR;
}

function formatCategory(category: string): string {
  return category.charAt(0) + category.slice(1).toLowerCase();
}

// ─── Severity config (glass rgba style) ─────────────────────
const DEFAULT_SEVERITY = {
  bg: 'bg-primary-500/10',
  text: 'text-primary-600',
  border: 'border-primary-500/15',
  dot: 'bg-primary-500',
  label: 'Low',
};

const severityConfig: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
  HIGH: { bg: 'bg-red-500/10', text: 'text-red-600', border: 'border-red-500/15', dot: 'bg-red-500', label: 'High' },
  MEDIUM: { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-500/15', dot: 'bg-amber-500', label: 'Medium' },
  LOW: DEFAULT_SEVERITY,
};

// ─── Action category config (glass rgba style) ──────────────
const DEFAULT_ACTION_CATEGORY = { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-500/15', label: 'Lifestyle' };

const actionCategoryConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
  DIET: { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/15', label: 'Diet' },
  EXERCISE: { bg: 'bg-primary-500/10', text: 'text-primary-600', border: 'border-primary-500/15', label: 'Exercise' },
  SUPPLEMENT: { bg: 'bg-purple-500/10', text: 'text-purple-600', border: 'border-purple-500/15', label: 'Supplement' },
  LIFESTYLE: DEFAULT_ACTION_CATEGORY,
  MEDICAL: { bg: 'bg-red-500/10', text: 'text-red-600', border: 'border-red-500/15', label: 'Medical' },
};

// ─── Trend config ────────────────────────────────────────────
const DEFAULT_TREND = { icon: '\u2192', color: 'text-slate-400' };

const trendConfig: Record<string, { icon: string; color: string }> = {
  IMPROVING: { icon: '\u2191', color: 'text-emerald-500' },
  STABLE: DEFAULT_TREND,
  DECLINING: { icon: '\u2193', color: 'text-red-500' },
};

// ─── Sub-components ──────────────────────────────────────────

function RiskFlagItem({ flag }: { flag: RiskFlag }) {
  const severity = severityConfig[flag.severity] ?? DEFAULT_SEVERITY;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/20 bg-white/20 p-4 backdrop-blur-sm">
      <span
        className={clsx(
          'mt-0.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold flex-shrink-0 backdrop-blur-sm',
          severity.bg,
          severity.text,
          severity.border,
        )}
      >
        <span
          className={clsx('inline-block h-1.5 w-1.5 rounded-full', severity.dot)}
          aria-hidden="true"
        />
        {severity.label}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{flag.biomarker}</p>
        <p className="mt-0.5 text-sm text-slate-500">{flag.message}</p>
      </div>
    </div>
  );
}

function ActionPlanCard({ item }: { item: ActionPlanItem }) {
  const catConfig = actionCategoryConfig[item.category] ?? DEFAULT_ACTION_CATEGORY;

  return (
    <div className="flex gap-4 rounded-xl border border-white/20 bg-white/20 p-4 backdrop-blur-sm">
      {/* Priority number */}
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-sm font-bold text-primary-600">
        {item.priority}
      </div>

      <div className="min-w-0 flex-1">
        {/* Title + category */}
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-800">{item.title}</h4>
          <span
            className={clsx(
              'inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold backdrop-blur-sm',
              catConfig.bg,
              catConfig.text,
              catConfig.border,
            )}
          >
            {catConfig.label}
          </span>
        </div>

        {/* Description */}
        <p className="mt-1 text-sm text-slate-500">{item.description}</p>

        {/* Biomarker chips + timeframe */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {item.relevantBiomarkers.map((biomarker) => (
            <span
              key={biomarker}
              className="inline-flex rounded-lg glass-subtle px-2 py-0.5 text-xs font-medium text-slate-500"
            >
              {biomarker}
            </span>
          ))}
          <span className="inline-flex rounded-lg bg-primary-500/10 border border-primary-500/15 px-2 py-0.5 text-xs font-semibold text-primary-600">
            {item.timeframe}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────

export default function InsightDetailPage() {
  const { id } = useParams<{ id: string }>();
  const insightId = decodeURIComponent(id ?? '');
  const { data: insight, isLoading, isError, error } = useInsight(insightId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner size="lg" text="Loading insight..." />
      </div>
    );
  }

  if (isError || !insight) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Link
          to="/insights"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Insights
        </Link>

        <div className="flex flex-col items-center py-12 text-center animate-fade-in">
          <p className="text-6xl font-bold text-slate-200 mb-4">404</p>
          <h1 className="text-xl font-semibold text-slate-800">Insight Not Found</h1>
          <p className="mt-1 text-sm text-slate-400">
            {error instanceof Error ? error.message : 'The insight you are looking for does not exist.'}
          </p>
          <Link to="/insights" className="btn-primary mt-6">
            Back to Insights
          </Link>
        </div>
      </div>
    );
  }

  const cat = getCategoryColor(insight.category);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back link */}
      <Link
        to="/insights"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Insights
      </Link>

      {/* Header */}
      <div className="card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold backdrop-blur-sm',
                cat.bg,
                cat.text,
                cat.border,
              )}
            >
              <span
                className={clsx('inline-block h-2 w-2 rounded-full', cat.dot)}
                aria-hidden="true"
              />
              {formatCategory(insight.category)}
            </span>
            <span className="text-sm text-slate-400">{formatDate(insight.createdAt)}</span>
          </div>

          {insight.overallScore != null && (
            <div className="text-center sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Overall Score
              </p>
              <p
                className={clsx(
                  'text-4xl font-bold tabular-nums',
                  getScoreColor(insight.overallScore),
                )}
              >
                {insight.overallScore}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="card p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Summary</h2>
        <p className="text-sm leading-relaxed text-slate-600">{insight.summary}</p>
      </div>

      {/* Full Analysis */}
      <div className="card p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Full Analysis</h2>
        <div className="prose prose-sm max-w-none text-slate-600">
          {insight.fullAnalysis.split('\n').map((paragraph, i) => (
            <p key={i} className="mb-2 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      {/* Category Scores */}
      {insight.categoryScores && Object.keys(insight.categoryScores).length > 0 && (
        <div className="card p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Category Scores</h2>
          <div className="space-y-4">
            {Object.entries(insight.categoryScores).map(([category, scoreData]) => {
              const trend = trendConfig[scoreData.trend] ?? DEFAULT_TREND;

              return (
                <div key={category}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">
                      {formatCategory(category)}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={clsx('text-sm font-medium', trend.color)}>
                        {trend.icon}
                      </span>
                      <span
                        className={clsx(
                          'text-sm font-semibold tabular-nums',
                          getScoreColor(scoreData.score),
                        )}
                      >
                        {scoreData.score}
                      </span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/30 backdrop-blur-sm">
                    <div
                      className={clsx(
                        'h-full rounded-full transition-all duration-500',
                        scoreData.score >= 80
                          ? 'bg-emerald-500'
                          : scoreData.score >= 60
                            ? 'bg-amber-500'
                            : 'bg-red-500',
                      )}
                      style={{ width: `${scoreData.score}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Risk Flags */}
      {insight.riskFlags.length > 0 && (
        <div className="card p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
            Risk Flags
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600">
              {insight.riskFlags.length}
            </span>
          </h2>
          <div className="space-y-3">
            {insight.riskFlags.map((flag, i) => (
              <RiskFlagItem key={i} flag={flag} />
            ))}
          </div>
        </div>
      )}

      {/* Action Plan */}
      {insight.actionPlan.length > 0 && (
        <div className="card p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
            Action Plan
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary-500/10 border border-primary-500/15 px-2 py-0.5 text-xs font-semibold text-primary-600">
              {insight.actionPlan.length}
            </span>
          </h2>
          <div className="space-y-3">
            {insight.actionPlan
              .slice()
              .sort((a, b) => a.priority - b.priority)
              .map((item) => (
                <ActionPlanCard key={item.priority} item={item} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

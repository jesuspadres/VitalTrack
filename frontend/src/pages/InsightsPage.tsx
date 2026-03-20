import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useInsights, useTriggerInsight } from '@/hooks/useInsights';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, getScoreColor } from '@/utils/format';
import type { InsightRecord } from '@/types/api';

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

// ─── InsightCard ─────────────────────────────────────────────
function InsightCard({ insight }: { insight: InsightRecord }) {
  const cat = getCategoryColor(insight.category);

  return (
    <Link
      to={`/insights/${encodeURIComponent(insight.insightId)}`}
      className="card group flex flex-col p-5"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Category badge */}
        <span
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold backdrop-blur-sm',
            cat.bg,
            cat.text,
            cat.border,
          )}
        >
          <span
            className={clsx('inline-block h-1.5 w-1.5 rounded-full', cat.dot)}
            aria-hidden="true"
          />
          {formatCategory(insight.category)}
        </span>

        {/* Overall score */}
        {insight.overallScore != null && (
          <span
            className={clsx(
              'text-2xl font-bold tabular-nums',
              getScoreColor(insight.overallScore),
            )}
          >
            {insight.overallScore}
          </span>
        )}
      </div>

      {/* Date */}
      <p className="mt-2 text-xs text-slate-400">{formatDate(insight.createdAt)}</p>

      {/* Summary — truncated to 2 lines */}
      <p className="mt-2 text-sm text-slate-600 line-clamp-2">{insight.summary}</p>

      {/* Meta counts */}
      <div className="mt-auto flex items-center gap-4 pt-4 text-xs text-slate-400">
        {insight.riskFlags.length > 0 && (
          <span className="flex items-center gap-1">
            <svg
              className="h-3.5 w-3.5 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            {insight.riskFlags.length} risk flag{insight.riskFlags.length === 1 ? '' : 's'}
          </span>
        )}
        {insight.actionPlan.length > 0 && (
          <span className="flex items-center gap-1">
            <svg
              className="h-3.5 w-3.5 text-primary-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {insight.actionPlan.length} action{insight.actionPlan.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* View link */}
      <p className="mt-3 text-xs font-semibold text-primary-500 group-hover:text-primary-600 transition-colors">
        View Details
        <span className="inline-block ml-1 transition-transform group-hover:translate-x-0.5">&rarr;</span>
      </p>
    </Link>
  );
}

// ─── InsightsPage ────────────────────────────────────────────
export default function InsightsPage() {
  const { data, isLoading, isError, error } = useInsights();
  const triggerInsight = useTriggerInsight();

  const [successMessage, setSuccessMessage] = useState('');

  const handleGenerate = async () => {
    setSuccessMessage('');
    try {
      await triggerInsight.mutateAsync();
      setSuccessMessage('Insight generation triggered. It may take a moment to appear.');
    } catch {
      // Error is accessible via triggerInsight.error
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner size="lg" text="Loading insights..." />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">AI Insights</h1>
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-600 backdrop-blur-sm">
          {error instanceof Error ? error.message : 'Failed to load insights.'}
        </div>
      </div>
    );
  }

  const insights = data?.insights ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">AI Insights</h1>
          <p className="mt-1 text-sm text-slate-400">
            AI-powered analysis of your biomarker data
          </p>
        </div>
        <button
          type="button"
          className="btn-primary flex items-center gap-2"
          onClick={handleGenerate}
          disabled={triggerInsight.isPending}
        >
          {triggerInsight.isPending ? (
            <>
              <svg
                className="animate-spin h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Generating...
            </>
          ) : (
            <>
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                />
              </svg>
              Generate New Insight
            </>
          )}
        </button>
      </div>

      {/* Success toast */}
      {successMessage && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-700 backdrop-blur-sm">
          {successMessage}
        </div>
      )}

      {/* Error toast */}
      {triggerInsight.isError && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-600 backdrop-blur-sm">
          {triggerInsight.error instanceof Error
            ? triggerInsight.error.message
            : 'Failed to trigger insight generation.'}
        </div>
      )}

      {/* Content */}
      {insights.length === 0 ? (
        <EmptyState
          icon={
            <svg
              className="h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          }
          title="No insights yet"
          description="Generate your first AI insight to get personalized analysis of your biomarker data."
          action={{
            label: 'Generate Your First Insight',
            onClick: handleGenerate,
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {insights.map((insight) => (
            <InsightCard key={insight.insightId} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
}

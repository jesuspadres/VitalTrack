import { Link } from 'react-router-dom';
import type { InsightRecord } from '@/types/api';
import { formatDate, getScoreColor } from '@/utils/format';

interface RecentInsightCardProps {
  insight: InsightRecord;
}

const categoryColors: Record<string, string> = {
  CARDIOVASCULAR: 'bg-red-500/10 text-red-600 border border-red-500/15',
  METABOLIC: 'bg-violet-500/10 text-violet-600 border border-violet-500/15',
  HORMONAL: 'bg-primary-500/10 text-primary-600 border border-primary-500/15',
  NUTRITIONAL: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/15',
  INFLAMMATION: 'bg-orange-500/10 text-orange-600 border border-orange-500/15',
  GENERAL: 'bg-slate-500/10 text-slate-600 border border-slate-500/15',
};

function formatCategory(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

export function RecentInsightCard({ insight }: RecentInsightCardProps) {
  const badgeClass = categoryColors[insight.category] ?? 'bg-slate-500/10 text-slate-600 border border-slate-500/15';

  return (
    <div className="card p-5 group">
      {/* Header row: category badge + date + optional score */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold backdrop-blur-sm ${badgeClass}`}
        >
          {formatCategory(insight.category)}
        </span>
        <span className="text-xs text-slate-400 font-medium">{formatDate(insight.createdAt)}</span>
        {insight.overallScore !== undefined && (
          <span
            className={`ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold glass-subtle ${getScoreColor(insight.overallScore)}`}
          >
            {insight.overallScore}
          </span>
        )}
      </div>

      {/* Summary */}
      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-600">
        {insight.summary}
      </p>

      {/* View details link */}
      <Link
        to={`/insights/${encodeURIComponent(insight.insightId)}`}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary-500 hover:text-primary-600 transition-colors group-hover:gap-2"
      >
        View Details
        <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
      </Link>
    </div>
  );
}

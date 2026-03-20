import { getScoreColor } from '@/utils/format';

interface HealthScoreCardProps {
  score: number | undefined;
}

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getStrokeColor(score: number): string {
  if (score >= 80) return '#10b981'; // emerald-500
  if (score >= 60) return '#f59e0b'; // amber-500
  return '#ef4444'; // red-500
}

function getGlowColor(score: number): string {
  if (score >= 80) return 'rgba(16, 185, 129, 0.15)';
  if (score >= 60) return 'rgba(245, 158, 11, 0.15)';
  return 'rgba(239, 68, 68, 0.15)';
}

export function HealthScoreCard({ score }: HealthScoreCardProps) {
  const hasScore = score !== undefined;
  const offset = hasScore ? CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE : CIRCUMFERENCE;

  return (
    <div className="card p-6">
      <div className="flex flex-col items-center">
        {/* Circular progress ring with glow */}
        <div className="relative">
          {hasScore && (
            <div
              className="absolute inset-0 rounded-full blur-xl transition-all duration-700"
              style={{ background: getGlowColor(score) }}
            />
          )}
          <svg width="130" height="130" viewBox="0 0 100 100" className="relative" aria-hidden="true">
            {/* Background track */}
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              stroke="rgba(6, 182, 212, 0.08)"
              strokeWidth="7"
            />
            {/* Progress arc */}
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              stroke={hasScore ? getStrokeColor(score) : 'rgba(148, 163, 184, 0.2)'}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              transform="rotate(-90 50 50)"
              className="transition-all duration-1000 ease-out"
              style={{
                filter: hasScore ? `drop-shadow(0 0 6px ${getGlowColor(score)})` : 'none',
              }}
            />
            {/* Score text in center */}
            <text
              x="50"
              y="48"
              textAnchor="middle"
              dominantBaseline="central"
              className={hasScore ? getScoreColor(score) : 'text-slate-300'}
              style={{
                fontSize: hasScore ? '26px' : '28px',
                fontWeight: 700,
                fontFamily: 'Outfit, system-ui, sans-serif',
                fill: hasScore ? getStrokeColor(score) : '#cbd5e1',
              }}
            >
              {hasScore ? score : '\u2014'}
            </text>
            {hasScore && (
              <text
                x="50"
                y="64"
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fontSize: '9px',
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

        {/* Label */}
        <p className="mt-3 text-sm font-medium text-slate-400 tracking-wide">Health Score</p>
      </div>
    </div>
  );
}

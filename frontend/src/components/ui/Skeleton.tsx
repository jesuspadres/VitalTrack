import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
}

/** Base shimmer block — use `className` to set height/width/rounded. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={clsx(
        'animate-pulse rounded-xl bg-gradient-to-r from-white/40 via-white/70 to-white/40 bg-[length:200%_100%]',
        className,
      )}
      aria-hidden="true"
    />
  );
}

// ─── Composite Skeletons ─────────────────────────────────────

/** Dashboard page skeleton: score ring + stat chips + sparkline grid. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero: score ring + stats */}
      <div className="card p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
          <Skeleton className="h-[140px] w-[140px] rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-3 w-full">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-7 w-32 rounded-full" />
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-7 w-28 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Section header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>

      {/* Sparkline grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Biomarker table skeleton: filter bar + table rows. */
export function BiomarkerTableSkeleton() {
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-6 w-10 rounded-full" />
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex gap-3">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-10 w-40 rounded-xl" />
        <div className="flex-1" />
        <Skeleton className="h-4 w-20 self-center" />
      </div>

      {/* Table rows */}
      <div className="card overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-4 px-4 py-3 border-b border-white/20">
          {['w-24', 'w-20', 'w-20', 'w-16', 'w-24', 'w-12'].map((w, i) => (
            <Skeleton key={i} className={`h-3 ${w}`} />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3 border-b border-white/10"
          >
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-10 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Profile page skeleton. */
export function ProfileSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      <div className="card p-6 space-y-5">
        <Skeleton className="h-3 w-40" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-40" />
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6 space-y-5">
        <Skeleton className="h-3 w-24" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md rounded-xl" />
          <Skeleton className="h-10 w-full max-w-md rounded-xl" />
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** Biomarker detail page skeleton. */
export function BiomarkerDetailSkeleton() {
  return (
    <div className="animate-fade-in">
      <Skeleton className="mb-6 h-4 w-32" />
      <div className="mb-6 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-24 rounded-xl" />
      </div>

      <div className="card mb-6 p-6">
        <Skeleton className="mb-4 h-3 w-16" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6">
        <Skeleton className="mb-4 h-3 w-40" />
        <Skeleton className="h-[250px] w-full rounded-xl" />
      </div>
    </div>
  );
}

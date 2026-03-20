import clsx from 'clsx';

type BiomarkerStatus = 'OPTIMAL' | 'NORMAL' | 'BORDERLINE' | 'OUT_OF_RANGE';

const statusConfig: Record<
  BiomarkerStatus,
  { className: string; label: string; dotColor: string }
> = {
  OPTIMAL: {
    className: 'status-optimal',
    label: 'Optimal',
    dotColor: 'bg-emerald-400',
  },
  NORMAL: {
    className: 'status-normal',
    label: 'Normal',
    dotColor: 'bg-primary-400',
  },
  BORDERLINE: {
    className: 'status-borderline',
    label: 'Borderline',
    dotColor: 'bg-amber-400',
  },
  OUT_OF_RANGE: {
    className: 'status-out-of-range',
    label: 'Out of Range',
    dotColor: 'bg-red-400',
  },
};

interface StatusBadgeProps {
  status: BiomarkerStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur-sm',
        config.className,
        className,
      )}
    >
      <span
        className={clsx(
          'inline-block h-1.5 w-1.5 rounded-full shadow-sm',
          config.dotColor,
        )}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}

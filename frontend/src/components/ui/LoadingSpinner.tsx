import clsx from 'clsx';

const sizeMap = {
  sm: 'h-5 w-5',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
} as const;

interface LoadingSpinnerProps {
  size?: keyof typeof sizeMap;
  className?: string;
  text?: string;
}

export function LoadingSpinner({
  size = 'md',
  className,
  text,
}: LoadingSpinnerProps) {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-3', className)}>
      <div className="relative">
        {/* Glow backdrop */}
        <div className={clsx('absolute inset-0 rounded-full bg-primary-400/20 blur-lg', sizeMap[size])} />
        <svg
          className={clsx('relative animate-spin text-primary-500', sizeMap[size])}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-10"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-80"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>
      {text && <p className="text-sm font-medium text-slate-400">{text}</p>}
    </div>
  );
}

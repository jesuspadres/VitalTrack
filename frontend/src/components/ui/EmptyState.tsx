import type { ReactNode } from 'react';
import clsx from 'clsx';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in',
        className,
      )}
    >
      {icon && (
        <div className="mb-5 rounded-2xl p-4 glass text-slate-300" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-400 leading-relaxed">{description}</p>
      {action && (
        <button
          type="button"
          className="btn-primary mt-8"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

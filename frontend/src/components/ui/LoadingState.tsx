import { clsx } from 'clsx';

interface LoadingStateProps {
  label?: string;
  rows?: number;
  variant?: 'cards' | 'table' | 'detail';
  className?: string;
}

export function LoadingState({
  label = 'Carregando dados...',
  rows = 3,
  variant = 'cards',
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={clsx('space-y-4', className)}
    >
      <span className="sr-only">{label}</span>

      {variant === 'cards' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="rounded-[10px] border border-[#DCE1EB] bg-white p-5 shadow-card animate-pulse"
            >
              <div className="h-4 w-24 rounded bg-[#EEF1F7]" />
              <div className="mt-3 h-6 w-3/4 rounded bg-[#EEF1F7]" />
              <div className="mt-2 h-4 w-full rounded bg-[#F8F8F5]" />
              <div className="mt-5 flex justify-between items-center">
                <div className="h-5 w-20 rounded bg-[#F8F8F5]" />
                <div className="h-9 w-28 rounded-lg bg-[#EEF1F7]" />
              </div>
            </div>
          ))}
        </div>
      )}

      {variant === 'table' && (
        <div className="rounded-[10px] border border-[#DCE1EB] bg-white p-5 shadow-card animate-pulse space-y-3">
          <div className="h-5 w-48 rounded bg-[#EEF1F7]" />
          <div className="divide-y divide-[#DCE1EB]">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-3 gap-4">
                <div className="h-4 w-1/3 rounded bg-[#EEF1F7]" />
                <div className="h-4 w-1/5 rounded bg-[#F8F8F5]" />
                <div className="h-6 w-20 rounded bg-[#F8F8F5]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {variant === 'detail' && (
        <div className="space-y-4 animate-pulse">
          <div className="rounded-[10px] border border-[#DCE1EB] bg-white p-6">
            <div className="h-7 w-1/2 rounded bg-[#EEF1F7]" />
            <div className="mt-3 h-4 w-2/3 rounded bg-[#F8F8F5]" />
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-[#F8F8F5]" />
              ))}
            </div>
          </div>
          <div className="rounded-[10px] border border-[#DCE1EB] bg-white p-6 h-64" />
        </div>
      )}
    </div>
  );
}

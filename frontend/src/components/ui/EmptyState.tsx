import React from 'react';
import { clsx } from 'clsx';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center rounded-[10px] border border-dashed border-[#C4CCDC] bg-white px-6 py-12 text-center',
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#DCE1EB] bg-[#F8F8F5] text-[#4B5568]">
        {icon}
      </div>
      <h3 className="mt-4 font-display text-base font-bold text-[#131B2E]">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-[#4B5568]">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

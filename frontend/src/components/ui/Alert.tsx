import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

const TONE_MAP: Record<
  AlertTone,
  { container: string; icon: React.ReactNode; titleColor: string }
> = {
  info: {
    container: 'bg-[#EEF3FF] border-[#C7D7FE] text-[#131B2E]',
    icon: <Info className="h-5 w-5 text-[#1B4FD8] shrink-0" aria-hidden="true" />,
    titleColor: 'text-[#131B2E]',
  },
  success: {
    container: 'bg-[#ECFDF5] border-[#A7F3D0] text-[#064E3B]',
    icon: <CheckCircle2 className="h-5 w-5 text-[#0F766E] shrink-0" aria-hidden="true" />,
    titleColor: 'text-[#064E3B]',
  },
  warning: {
    container: 'bg-[#FFFBEB] border-[#FDE68A] text-[#78350F]',
    icon: <AlertTriangle className="h-5 w-5 text-[#B45309] shrink-0" aria-hidden="true" />,
    titleColor: 'text-[#78350F]',
  },
  danger: {
    container: 'bg-[#FFF1F2] border-[#FECDD3] text-[#881337]',
    icon: <AlertCircle className="h-5 w-5 text-[#BE123C] shrink-0" aria-hidden="true" />,
    titleColor: 'text-[#881337]',
  },
};

export function Alert({ tone = 'info', title, children, action, className }: AlertProps) {
  const styles = TONE_MAP[tone];
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={clsx(
        'flex flex-col sm:flex-row sm:items-start gap-3 rounded-[10px] border p-4 text-sm',
        styles.container,
        className
      )}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="mt-0.5">{styles.icon}</div>
        <div className="min-w-0 flex-1">
          {title ? <p className={clsx('font-semibold', styles.titleColor)}>{title}</p> : null}
          <div className={clsx(title ? 'mt-0.5 text-sm leading-relaxed' : 'text-sm leading-relaxed')}>
            {children}
          </div>
        </div>
      </div>
      {action ? <div className="shrink-0 sm:self-center">{action}</div> : null}
    </div>
  );
}

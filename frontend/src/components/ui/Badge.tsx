import React from 'react';
import { clsx } from 'clsx';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'navy';

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-[#F1F3F7] text-[#334155] border-[#DCE1EB]',
  primary: 'bg-[#EEF3FF] text-[#1640B0] border-[#C7D7FE]',
  success: 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]',
  warning: 'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]',
  danger: 'bg-[#FFF1F2] text-[#9F1239] border-[#FECDD3]',
  navy: 'bg-[#131B2E]/8 text-[#131B2E] border-[#131B2E]/20',
};

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold leading-5 tabular-nums',
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

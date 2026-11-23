import React from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[#1B4FD8] text-white border border-[#1B4FD8] hover:bg-[#1640B0] active:bg-[#123493] shadow-card disabled:bg-[#93B0F4] disabled:border-[#93B0F4]',
  secondary:
    'bg-[#131B2E] text-white border border-[#131B2E] hover:bg-[#1D2944] active:bg-[#0D1322] shadow-card disabled:bg-slate-400 disabled:border-slate-400',
  outline:
    'bg-white text-[#131B2E] border border-[#CBD3E1] hover:bg-[#F8F8F5] hover:border-[#9AA5BC] active:bg-[#EEF1F7] disabled:text-slate-400 disabled:bg-slate-50',
  ghost:
    'bg-transparent text-[#334155] border border-transparent hover:bg-[#EEF1F7] active:bg-[#DCE1EB] disabled:text-slate-400',
  danger:
    'bg-[#BE123C] text-white border border-[#BE123C] hover:bg-[#9F1239] active:bg-[#881337] shadow-card disabled:bg-rose-300 disabled:border-rose-300',
  success:
    'bg-[#0F766E] text-white border border-[#0F766E] hover:bg-[#0D5F59] active:bg-[#115E59] shadow-card disabled:bg-teal-300 disabled:border-teal-300',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-2 text-xs gap-1.5 min-h-[44px] sm:min-h-[38px]',
  md: 'px-4 py-2.5 text-sm gap-2 min-h-[44px]',
  lg: 'px-5 py-3 text-sm gap-2 min-h-[48px]',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg font-semibold cursor-pointer transition-all duration-150 active:translate-y-px disabled:active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4FD8] focus-visible:ring-offset-2 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
      ) : leftIcon ? (
        <span className="shrink-0 flex items-center">{leftIcon}</span>
      ) : null}
      <span>{children}</span>
      {!isLoading && rightIcon ? <span className="shrink-0 flex items-center">{rightIcon}</span> : null}
    </button>
  );
}

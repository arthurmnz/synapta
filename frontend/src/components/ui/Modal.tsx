import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#131B2E]/55"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={clsx(
          'w-full rounded-[10px] border border-[#DCE1EB] bg-white shadow-elevated overflow-hidden',
          SIZE_CLASSES[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#DCE1EB] px-6 py-4">
          <div className="min-w-0">
            <h3 id="modal-title" className="font-display text-base font-bold text-[#131B2E]">
              {title}
            </h3>
            {description ? <p className="mt-1 text-sm text-[#4B5568]">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#4B5568] hover:bg-[#EEF1F7] hover:text-[#131B2E] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[75vh] overflow-y-auto">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#DCE1EB] bg-[#F8F8F5] px-6 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

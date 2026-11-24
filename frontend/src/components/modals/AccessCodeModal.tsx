import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Alert, Button, Modal } from '../ui';
import { ApiError } from '../../lib/apiClient';

export type AccessEntityType = 'organization' | 'classroom' | 'list';

interface AccessCodeModalProps {
  open: boolean;
  onClose: () => void;
  entityType: AccessEntityType;
  entityName: string;
  subtitle?: string | null;
  onSubmit: (accessCode: string) => Promise<void>;
}

const ENTITY_COPY: Record<
  AccessEntityType,
  { title: string; badge: string; submitLabel: string; helper: string }
> = {
  organization: {
    title: 'Desbloquear Organização Privada',
    badge: 'Organização privada',
    submitLabel: 'Desbloquear e Ingressar',
    helper:
      'Informe o código compartilhado pelo professor responsável. Após validado, seu ingresso nesta organização fica permanente.',
  },
  classroom: {
    title: 'Entrar em Turma Privada',
    badge: 'Turma privada',
    submitLabel: 'Confirmar Matrícula',
    helper:
      'Esta turma exige código de acesso para matrícula. Depois de entrar, você não precisará informar o código novamente.',
  },
  list: {
    title: 'Desbloquear Simulado Privado',
    badge: 'Simulado privado',
    submitLabel: 'Desbloquear Simulado',
    helper:
      'Informe o código de acesso deste simulado. O desbloqueio é permanente na sua conta para esta e próximas revisões.',
  },
};

export function AccessCodeModal({
  open,
  onClose,
  entityType,
  entityName,
  subtitle,
  onSubmit,
}: AccessCodeModalProps) {
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAccessCode('');
      setError(null);
      setSubmitting(false);
    }
  }, [open, entityName, entityType]);

  const copy = ENTITY_COPY[entityType];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = accessCode.trim();
    if (!trimmed) {
      setError('Digite o código de acesso para continuar.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível validar o código de acesso. Tente novamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title={copy.title}
      description={subtitle ?? undefined}
      size="sm"
      footer={
        <>
          <Button variant="ghost" disabled={submitting} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="access-code-modal-form"
            variant="primary"
            isLoading={submitting}
            leftIcon={<Lock className="h-3.5 w-3.5" />}
          >
            {copy.submitLabel}
          </Button>
        </>
      }
    >
      <form id="access-code-modal-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-[#DCE1EB] bg-[#F8F8F5] p-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]">
            <Lock className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#4B5568]">{copy.badge}</p>
            <p className="truncate font-display text-sm font-bold text-[#131B2E]">{entityName}</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-[#4B5568]">{copy.helper}</p>

        {error && <Alert tone="danger">{error}</Alert>}

        <div>
          <label
            htmlFor="access-code-modal-input"
            className="block text-sm font-semibold text-[#131B2E]"
          >
            Código de acesso
          </label>
          <input
            id="access-code-modal-input"
            type="text"
            autoFocus
            autoComplete="off"
            value={accessCode}
            onChange={(e) => {
              setAccessCode(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Digite o código informado pelo professor"
            aria-invalid={Boolean(error)}
            className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2.5 font-mono text-base sm:text-sm tracking-wider text-[#131B2E] placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
          />
        </div>
      </form>
    </Modal>
  );
}

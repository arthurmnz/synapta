import { useState } from 'react';
import { Building2, Check, Copy, Globe, KeyRound, Layers, Lock, Unlock } from 'lucide-react';
import { Badge } from '../ui/Badge';
import type { VisibilityType } from '../../types/api';

interface VisibilityBadgeProps {
  visibility: VisibilityType;
  entity?: 'masculine' | 'feminine';
  unlocked?: boolean;
}

export function VisibilityBadge({
  visibility,
  entity = 'masculine',
  unlocked = false,
}: VisibilityBadgeProps) {
  if (visibility === 'private') {
    if (unlocked) {
      return (
        <Badge tone="success">
          <Unlock className="h-3 w-3" aria-hidden="true" />
          {entity === 'feminine' ? 'Privada · Desbloqueada' : 'Privado · Desbloqueado'}
        </Badge>
      );
    }
    return (
      <Badge tone="warning">
        <Lock className="h-3 w-3" aria-hidden="true" />
        {entity === 'feminine' ? 'Privada' : 'Privado'}
      </Badge>
    );
  }

  return (
    <Badge tone="success">
      <Globe className="h-3 w-3" aria-hidden="true" />
      {entity === 'feminine' ? 'Pública' : 'Público'}
    </Badge>
  );
}

interface ListContextBadgesProps {
  isStandalone?: boolean;
  classroomName?: string | null;
  organizationName?: string | null;
}

export function ListContextBadges({
  isStandalone = false,
  classroomName,
  organizationName,
}: ListContextBadgesProps) {
  if (isStandalone || !classroomName) {
    return (
      <Badge tone="primary">
        <Layers className="h-3 w-3" aria-hidden="true" />
        Simulado Avulso
      </Badge>
    );
  }

  return (
    <>
      {organizationName ? (
        <Badge tone="neutral">
          <Building2 className="h-3 w-3" aria-hidden="true" />
          {organizationName}
        </Badge>
      ) : null}
      <Badge tone="navy">{classroomName}</Badge>
    </>
  );
}

interface AccessCodeDisplayProps {
  code: string;
  label?: string;
}

export function AccessCodeDisplay({ code, label = 'Código de acesso' }: AccessCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable in restricted/headless contexts
    }
  };

  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-1.5 text-xs">
      <KeyRound className="h-3.5 w-3.5 text-[#92400E] shrink-0" aria-hidden="true" />
      <span className="font-medium text-[#78350F]">{label}:</span>
      <code className="font-mono font-bold tracking-wider text-[#131B2E] tabular-nums">{code}</code>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={`Copiar ${label.toLowerCase()} ${code}`}
        className="inline-flex min-h-[28px] items-center gap-1 rounded border border-[#FCD34D] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#92400E] hover:bg-[#FEF3C7] transition-colors cursor-pointer"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3" aria-hidden="true" />
            Copiado
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" aria-hidden="true" />
            Copiar
          </>
        )}
      </button>
    </div>
  );
}

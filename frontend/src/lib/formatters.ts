import type { RetakeStatus, TopicMetricOut } from '../types/api';

export type PerformanceTier = 'strong' | 'intermediate' | 'critical';

export function formatPercent(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)}%`;
}

export function formatScoreRatio(correct: number, total: number): string {
  return `${correct} de ${total}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function getPerformanceTier(percentage: number): PerformanceTier {
  if (percentage >= 75) return 'strong';
  if (percentage >= 50) return 'intermediate';
  return 'critical';
}

export function getPerformanceTierMeta(percentage: number): {
  tier: PerformanceTier;
  label: string;
  barColor: string;
  badgeTone: 'success' | 'warning' | 'danger';
  textClass: string;
  surfaceClass: string;
} {
  const tier = getPerformanceTier(percentage);
  if (tier === 'strong') {
    return {
      tier,
      label: 'Bom rendimento',
      barColor: '#059669',
      badgeTone: 'success',
      textClass: 'text-emerald-800',
      surfaceClass: 'bg-emerald-50 border-emerald-200',
    };
  }
  if (tier === 'intermediate') {
    return {
      tier,
      label: 'Em evolução',
      barColor: '#D97706',
      badgeTone: 'warning',
      textClass: 'text-amber-800',
      surfaceClass: 'bg-amber-50 border-amber-200',
    };
  }
  return {
    tier,
    label: 'Foco de reforço',
    barColor: '#BE123C',
    badgeTone: 'danger',
    textClass: 'text-rose-800',
    surfaceClass: 'bg-rose-50 border-rose-200',
  };
}

export function formatPerformanceBand(band: string | null | undefined, percentage: number): string {
  if (!band) return getPerformanceTierMeta(percentage).label;
  const normalized = band.toLowerCase();
  const map: Record<string, string> = {
    excellent: 'Excelente',
    strong: 'Bom rendimento',
    good: 'Bom rendimento',
    satisfactory: 'Bom rendimento',
    attention: 'Em atenção',
    average: 'Em evolução',
    intermediate: 'Em evolução',
    needs_improvement: 'Precisa de reforço',
    critical: 'Foco de reforço',
    low: 'Foco de reforço',
  };
  return map[normalized] ?? band;
}

export function formatRetakeStatus(status: RetakeStatus): {
  label: string;
  tone: 'neutral' | 'warning' | 'success' | 'danger';
} {
  switch (status) {
    case 'pending':
      return { label: 'Nova tentativa solicitada', tone: 'warning' };
    case 'approved':
      return { label: 'Nova tentativa liberada', tone: 'success' };
    case 'rejected':
      return { label: 'Solicitação recusada', tone: 'danger' };
    case 'none':
    default:
      return { label: 'Sem solicitação ativa', tone: 'neutral' };
  }
}

export function formatTopicSummary(topic: TopicMetricOut | string | null | undefined): {
  name: string;
  accuracy: number | null;
} | null {
  if (!topic) return null;
  if (typeof topic === 'string') {
    return { name: topic, accuracy: null };
  }
  return {
    name: topic.topic_name,
    accuracy: topic.accuracy_percentage,
  };
}

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  MessageSquareText,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  LoadingState,
} from '../../components/ui';
import { TopicPerformanceChart } from '../../components/charts/TopicPerformanceChart';
import { AppShell } from '../../components/layout/AppShell';
import { apiClient, ApiError } from '../../lib/apiClient';
import {
  formatDateTime,
  formatPercent,
  formatPerformanceBand,
  formatScoreRatio,
  getPerformanceTierMeta,
} from '../../lib/formatters';
import type { OptionKey, SubmissionFeedbackOut } from '../../types/api';

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];

export function StudentFeedbackPage() {
  const { submissionId } = useParams<{ submissionId: string }>();

  const [feedback, setFeedback] = useState<SubmissionFeedbackOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showRetakeForm, setShowRetakeForm] = useState(false);
  const [retakeReason, setRetakeReason] = useState('');
  const [requestingRetake, setRequestingRetake] = useState(false);
  const [retakeNotice, setRetakeNotice] = useState<string | null>(null);

  const loadSubmission = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getStudentSubmissionDetail(submissionId);
      setFeedback(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar o feedback desta avaliação.'
      );
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    void loadSubmission();
  }, [loadSubmission]);

  const handleRequestRetake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback) return;
    setRequestingRetake(true);
    setError(null);
    setRetakeNotice(null);
    try {
      await apiClient.requestRetake(feedback.question_list_id, retakeReason);
      setRetakeNotice('Solicitação de nova tentativa enviada ao professor.');
      setShowRetakeForm(false);
      setRetakeReason('');
      await loadSubmission();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível solicitar uma nova tentativa.'
      );
    } finally {
      setRequestingRetake(false);
    }
  };

  const tierMeta = feedback ? getPerformanceTierMeta(feedback.score_percentage) : null;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/student/dashboard"
            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#4B5568] hover:text-[#131B2E]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar para Simulados
          </Link>
          <Link
            to="/student/history"
            className="inline-flex min-h-[44px] items-center text-sm font-semibold text-[#1B4FD8] hover:underline"
          >
            Ver todo o histórico
          </Link>
        </div>

        {loading ? (
          <LoadingState label="Carregando feedback da avaliação..." variant="detail" />
        ) : error && !feedback ? (
          <Alert
            tone="danger"
            title="Erro ao carregar feedback"
            action={
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={() => void loadSubmission()}
              >
                Tentar novamente
              </Button>
            }
          >
            {error}
          </Alert>
        ) : !feedback || !tierMeta ? null : (
          <>
            {error && <Alert tone="danger">{error}</Alert>}
            {retakeNotice && <Alert tone="success">{retakeNotice}</Alert>}

            {/* Graded Exam Summary Sheet */}
            <div className="rounded-[10px] border border-[#DCE1EB] bg-math-grid overflow-hidden shadow-card">
              <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="navy">{feedback.classroom_name}</Badge>
                    <Badge tone="primary" className="font-mono">
                      Tentativa #{feedback.attempt_number} de {feedback.attempts_used_total}
                    </Badge>
                    <Badge tone={tierMeta.badgeTone}>
                      {formatPerformanceBand(feedback.performance_band, feedback.score_percentage)}
                    </Badge>
                  </div>
                  <h1 className="font-display text-2xl font-bold tracking-tight text-[#131B2E]">
                    {feedback.question_list_title}
                  </h1>
                  <p className="text-xs text-[#4B5568]">
                    Entregue em {formatDateTime(feedback.submitted_at)}
                  </p>
                </div>

                {/* Ruled Score Stamp */}
                <div className="shrink-0 rounded-lg border border-[#131B2E]/20 bg-white px-5 py-4 flex flex-wrap items-center gap-6">
                  <div>
                    <p className="text-xs font-semibold text-[#4B5568]">Nota obtida</p>
                    <p className="mt-0.5 font-display text-3xl font-bold text-[#131B2E] tabular-nums">
                      {formatPercent(feedback.score_percentage, 0)}
                    </p>
                  </div>
                  <div className="h-10 w-px bg-[#DCE1EB]" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-semibold text-[#4B5568]">Acertos</p>
                    <p className="mt-0.5 font-mono text-xl font-bold text-[#131B2E] tabular-nums">
                      {formatScoreRatio(feedback.correct_count, feedback.total_questions)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Retake Action Strip */}
              <div className="border-t border-[#DCE1EB] bg-white px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {feedback.can_attempt ? (
                  <>
                    <p className="text-sm font-medium text-[#065F46]">
                      Você tem uma nova tentativa autorizada pelo professor para este simulado.
                    </p>
                    <Link to={`/student/lists/${feedback.question_list_id}`}>
                      <Button variant="primary" size="sm">
                        Refazer Simulado
                      </Button>
                    </Link>
                  </>
                ) : feedback.retake_status === 'pending' ? (
                  <div className="flex items-center gap-2 text-sm font-medium text-[#92400E]">
                    <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      Sua solicitação de nova tentativa está pendente de autorização do professor.
                    </span>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-[#4B5568]">
                      {feedback.retake_status === 'rejected'
                        ? 'Sua última solicitação de nova tentativa foi recusada.'
                        : 'Deseja refazer este simulado? Solicite autorização ao seu professor.'}
                    </p>
                    {!showRetakeForm && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowRetakeForm(true)}
                      >
                        Solicitar Nova Tentativa
                      </Button>
                    )}
                  </>
                )}
              </div>

              {showRetakeForm && !feedback.can_attempt && feedback.retake_status !== 'pending' && (
                <form
                  onSubmit={handleRequestRetake}
                  className="border-t border-[#DCE1EB] bg-[#F8F8F5] px-5 sm:px-6 py-4 space-y-3"
                >
                  <label
                    htmlFor="feedback-retake-reason"
                    className="block text-sm font-semibold text-[#131B2E]"
                  >
                    Motivo da solicitação (opcional)
                  </label>
                  <textarea
                    id="feedback-retake-reason"
                    rows={2}
                    value={retakeReason}
                    onChange={(e) => setRetakeReason(e.target.value)}
                    placeholder="Ex.: Estudei novamente o gabarito e quero tentar melhorar minha nota."
                    className="block w-full rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E] placeholder:text-slate-400 focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      isLoading={requestingRetake}
                      leftIcon={<Send className="h-3.5 w-3.5" />}
                    >
                      Enviar Solicitação
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowRetakeForm(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {/* Teacher Manual Comment */}
            <div
              className={clsx(
                'rounded-[10px] border p-5 sm:p-6 shadow-card',
                feedback.teacher_comment
                  ? 'border-[#C7D7FE] bg-[#EEF3FF]'
                  : 'border-[#DCE1EB] bg-white'
              )}
            >
              <div className="flex items-start gap-3.5">
                <div
                  className={clsx(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    feedback.teacher_comment
                      ? 'bg-[#1B4FD8] text-white'
                      : 'border border-[#DCE1EB] bg-[#F8F8F5] text-[#4B5568]'
                  )}
                >
                  <MessageSquareText className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-base font-bold text-[#131B2E]">
                      Comentário do Professor
                    </h2>
                    {feedback.teacher_commented_at && (
                      <span className="text-xs text-[#4B5568]">
                        Atualizado em {formatDateTime(feedback.teacher_commented_at)}
                      </span>
                    )}
                  </div>
                  {feedback.teacher_comment ? (
                    <p className="mt-2 text-sm leading-relaxed text-[#131B2E] whitespace-pre-line max-w-[72ch]">
                      {feedback.teacher_comment}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-sm text-[#4B5568]">
                      O professor ainda não adicionou um comentário manual nesta entrega.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Topic Breakdown */}
            <Card>
              <CardHeader
                title="Rendimento por Assunto nesta Avaliação"
                description="Assuntos ordenados do menor para o maior aproveitamento para orientar sua revisão."
              />
              <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2">
                  <TopicPerformanceChart topics={feedback.topic_breakdown} sortOrder="asc" />
                </div>
                <div className="divide-y divide-[#DCE1EB] rounded-lg border border-[#DCE1EB] bg-[#F8F8F5] overflow-hidden">
                  {feedback.topic_breakdown.map((topic) => {
                    const tMeta = getPerformanceTierMeta(topic.accuracy_percentage);
                    return (
                      <div
                        key={String(topic.topic_id)}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-white"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[#131B2E]">
                            {topic.topic_name}
                          </p>
                          <p className="text-xs text-[#4B5568] tabular-nums">
                            {topic.correct_answers} de {topic.total_answers} acertos
                          </p>
                        </div>
                        <Badge tone={tMeta.badgeTone} className="font-mono">
                          {formatPercent(topic.accuracy_percentage)}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* Question by Question Review — Ruled Workbook Anatomy */}
            <section aria-labelledby="gabarito-heading" className="space-y-4">
              <h2 id="gabarito-heading" className="font-display text-lg font-bold text-[#131B2E]">
                Gabarito e Resolução Comentada ({feedback.questions_feedback.length})
              </h2>

              <div className="space-y-4">
                {[...feedback.questions_feedback]
                  .sort((a, b) => a.order_index - b.order_index)
                  .map((item, idx) => (
                    <div
                      key={String(item.question_id)}
                      className="rounded-[10px] border border-[#DCE1EB] bg-white shadow-card overflow-hidden grid grid-cols-1 md:grid-cols-[84px_1fr]"
                    >
                      <div className="border-b md:border-b-0 md:border-r border-[#DCE1EB] bg-[#F8F8F5] px-4 py-3 md:py-5 flex md:flex-col items-center md:items-start justify-between md:justify-start gap-2">
                        <span className="font-mono text-lg font-bold text-[#131B2E] tabular-nums">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        {item.is_correct ? (
                          <Badge tone="success">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Acertou
                          </Badge>
                        ) : (
                          <Badge tone="danger">
                            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            Errou
                          </Badge>
                        )}
                      </div>

                      <div className="p-5 sm:p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[#4B5568]">
                            Questão {idx + 1}
                          </span>
                          <Badge tone="navy">{item.topic_name}</Badge>
                        </div>

                        <p className="text-base font-semibold text-[#131B2E] leading-relaxed whitespace-pre-line max-w-[72ch]">
                          {item.statement}
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {OPTION_KEYS.map((optKey) => {
                            const isCorrectOption = item.correct_option === optKey;
                            const isSelectedOption = item.selected_option === optKey;

                            return (
                              <div
                                key={optKey}
                                className={clsx(
                                  'rounded-lg border p-3 text-sm flex items-start gap-2.5',
                                  isCorrectOption
                                    ? 'border-[#A7F3D0] bg-[#ECFDF5]'
                                    : isSelectedOption && !item.is_correct
                                      ? 'border-[#FECDD3] bg-[#FFF1F2]'
                                      : 'border-[#DCE1EB] bg-white'
                                )}
                              >
                                <span
                                  className={clsx(
                                    'flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-xs font-bold',
                                    isCorrectOption
                                      ? 'bg-[#0F766E] text-white'
                                      : isSelectedOption && !item.is_correct
                                        ? 'bg-[#BE123C] text-white'
                                        : 'border border-[#DCE1EB] bg-[#F8F8F5] text-[#131B2E]'
                                  )}
                                >
                                  {optKey}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[#131B2E]">{item.options[optKey]}</p>
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    {isSelectedOption && (
                                      <span className="text-[11px] font-bold text-[#334155]">
                                        Sua escolha
                                      </span>
                                    )}
                                    {isCorrectOption && (
                                      <span className="text-[11px] font-bold text-[#065F46]">
                                        Gabarito oficial
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="rounded-lg border border-[#DCE1EB] bg-[#F8F8F5] px-4 py-3">
                          <p className="text-xs font-bold text-[#131B2E]">Resolução comentada</p>
                          <p className="mt-1 text-sm leading-relaxed text-[#334155] whitespace-pre-line max-w-[70ch]">
                            {item.explanation}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

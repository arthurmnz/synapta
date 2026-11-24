import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  X,
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
import { ListContextBadges } from '../../components/shared/AccessBadges';
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

export function TeacherSubmissionDetailPage() {
  const { submissionId } = useParams<{ submissionId: string }>();

  const [submission, setSubmission] = useState<SubmissionFeedbackOut | null>(null);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [savingComment, setSavingComment] = useState(false);
  const [authorizingRetake, setAuthorizingRetake] = useState(false);

  const loadSubmission = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getTeacherSubmissionDetail(submissionId);
      setSubmission(data);
      setCommentText(data.teacher_comment ?? '');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar os detalhes desta entrega.'
      );
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    void loadSubmission();
  }, [loadSubmission]);

  const handleSaveComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submissionId) return;
    setSavingComment(true);
    setError(null);
    setActionMessage(null);
    try {
      const trimmed = commentText.trim();
      const updated = await apiClient.updateSubmissionComment(
        submissionId,
        trimmed ? trimmed : null
      );
      setSubmission(updated);
      setCommentText(updated.teacher_comment ?? '');
      setActionMessage(
        updated.teacher_comment
          ? 'Comentário do professor salvo e visível para o aluno.'
          : 'Comentário removido desta avaliação.'
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível salvar o comentário.'
      );
    } finally {
      setSavingComment(false);
    }
  };

  const handleRemoveComment = async () => {
    if (!submissionId) return;
    setSavingComment(true);
    setError(null);
    setActionMessage(null);
    try {
      const updated = await apiClient.updateSubmissionComment(submissionId, null);
      setSubmission(updated);
      setCommentText('');
      setActionMessage('Comentário removido desta avaliação.');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível remover o comentário.'
      );
    } finally {
      setSavingComment(false);
    }
  };

  const handleAuthorizeDirectRetake = async () => {
    if (!submission) return;
    setAuthorizingRetake(true);
    setError(null);
    setActionMessage(null);
    try {
      await apiClient.authorizeStudentRetake(
        submission.question_list_id,
        submission.student_id
      );
      setActionMessage(
        `Nova tentativa autorizada para ${submission.student_name} neste simulado.`
      );
      await loadSubmission();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível autorizar a nova tentativa.'
      );
    } finally {
      setAuthorizingRetake(false);
    }
  };

  const handleDecidePendingRequest = async (decision: 'approved' | 'rejected') => {
    if (!submission?.pending_retake_request_id) return;
    setAuthorizingRetake(true);
    setError(null);
    setActionMessage(null);
    try {
      await apiClient.decideRetakeRequest(submission.pending_retake_request_id, decision);
      setActionMessage(
        decision === 'approved'
          ? `Solicitação de ${submission.student_name} aprovada! Nova tentativa liberada.`
          : `Solicitação de ${submission.student_name} recusada.`
      );
      await loadSubmission();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível processar a solicitação.'
      );
    } finally {
      setAuthorizingRetake(false);
    }
  };

  const tierMeta = submission ? getPerformanceTierMeta(submission.score_percentage) : null;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {submission ? (
            <Link
              to={`/teacher/students/${submission.student_id}`}
              className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#4B5568] hover:text-[#131B2E]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar para {submission.student_name}
            </Link>
          ) : (
            <Link
              to="/teacher/students"
              className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#4B5568] hover:text-[#131B2E]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar para Alunos
            </Link>
          )}
        </div>

        {error && (
          <Alert
            tone="danger"
            action={
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={() => void loadSubmission()}
              >
                Atualizar
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {actionMessage && <Alert tone="success">{actionMessage}</Alert>}

        {loading ? (
          <LoadingState label="Carregando detalhes da entrega..." variant="detail" />
        ) : !submission || !tierMeta ? null : (
          <>
            {/* Header & Retake Control — Graded Exam Sheet */}
            <div className="rounded-[10px] border border-[#DCE1EB] bg-math-grid overflow-hidden shadow-card">
              <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ListContextBadges
                      isStandalone={submission.is_standalone}
                      classroomName={submission.classroom_name}
                      organizationName={submission.organization_name}
                    />
                    <Badge tone="primary" className="font-mono">
                      Tentativa #{submission.attempt_number} de {submission.attempts_used_total}
                    </Badge>
                    <Badge tone={tierMeta.badgeTone}>
                      {formatPerformanceBand(
                        submission.performance_band,
                        submission.score_percentage
                      )}
                    </Badge>
                  </div>

                  <h1 className="font-display text-2xl font-bold tracking-tight text-[#131B2E]">
                    {submission.question_list_title}
                  </h1>

                  <p className="text-sm text-[#4B5568]">
                    Aluno:{' '}
                    <Link
                      to={`/teacher/students/${submission.student_id}`}
                      className="font-bold text-[#1B4FD8] hover:underline"
                    >
                      {submission.student_name}
                    </Link>{' '}
                    <span className="font-mono text-xs text-[#4B5568]">
                      ({submission.student_email})
                    </span>
                  </p>
                  <p className="text-xs text-[#4B5568]">
                    Entregue em {formatDateTime(submission.submitted_at)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-6 shrink-0 rounded-lg border border-[#131B2E]/20 bg-white px-5 py-4">
                  <div>
                    <p className="text-xs font-semibold text-[#4B5568]">Nota</p>
                    <p className="mt-0.5 font-display text-3xl font-bold text-[#131B2E] tabular-nums">
                      {formatPercent(submission.score_percentage)}
                    </p>
                  </div>
                  <div className="h-10 w-px bg-[#DCE1EB]" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-semibold text-[#4B5568]">Acertos</p>
                    <p className="mt-0.5 font-mono text-xl font-bold text-[#131B2E] tabular-nums">
                      {formatScoreRatio(submission.correct_count, submission.total_questions)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-[#DCE1EB] bg-white px-5 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                {submission.can_attempt ? (
                  <p className="text-sm font-semibold text-[#065F46]">
                    O aluno já possui uma nova tentativa liberada para este simulado.
                  </p>
                ) : submission.pending_retake_request_id ? (
                  <>
                    <p className="text-sm font-semibold text-[#92400E]">
                      Este aluno solicitou autorização para refazer o simulado.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        isLoading={authorizingRetake}
                        leftIcon={<Check className="h-3.5 w-3.5" />}
                        onClick={() => void handleDecidePendingRequest('approved')}
                      >
                        Autorizar Nova Tentativa
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={authorizingRetake}
                        leftIcon={<X className="h-3.5 w-3.5" />}
                        onClick={() => void handleDecidePendingRequest('rejected')}
                      >
                        Recusar Solicitação
                      </Button>
                    </div>
                  </>
                ) : submission.can_authorize_retake ? (
                  <>
                    <p className="text-sm text-[#4B5568]">
                      Você pode liberar manualmente uma nova tentativa para este aluno.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={authorizingRetake}
                      leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                      onClick={() => void handleAuthorizeDirectRetake()}
                    >
                      Autorizar Nova Tentativa
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-[#4B5568]">
                    Status de tentativa atualizado para este simulado.
                  </p>
                )}
              </div>
            </div>

            {/* Manual Teacher Comment Form */}
            <Card>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#14233C]/10 text-[#14233C]">
                  <MessageSquareText className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      Comentário Manual do Professor
                    </h2>
                    {submission.teacher_commented_at && (
                      <span className="text-xs text-slate-500">
                        Última atualização: {formatDateTime(submission.teacher_commented_at)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Escreva orientações personalizadas sobre o desempenho do aluno. Este texto fica
                    visível diretamente no feedback do aluno.
                  </p>

                  <form onSubmit={handleSaveComment} className="mt-4 space-y-3">
                    <textarea
                      rows={3}
                      aria-label="Comentário manual do professor"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Ex.: Excelente evolução na leitura e resolução! Recomendo revisar os assuntos abaixo de 60% antes da próxima tentativa."
                      className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        isLoading={savingComment}
                        leftIcon={<Save className="h-3.5 w-3.5" />}
                      >
                        Salvar Comentário
                      </Button>
                      {submission.teacher_comment && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={savingComment}
                          leftIcon={<Trash2 className="h-3.5 w-3.5 text-rose-700" />}
                          onClick={() => void handleRemoveComment()}
                        >
                          Remover Comentário
                        </Button>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            </Card>

            {/* Topic Breakdown */}
            <Card>
              <CardHeader
                title="Rendimento por Assunto nesta Entrega"
                description="Assuntos ordenados do menor para o maior aproveitamento."
              />
              <div className="mt-5">
                <TopicPerformanceChart topics={submission.topic_breakdown} sortOrder="asc" />
              </div>
            </Card>

            {/* Question by Question Student Answers — Ruled Workbook */}
            <section aria-labelledby="teacher-review-heading" className="space-y-4">
              <h2 id="teacher-review-heading" className="font-display text-lg font-bold text-[#131B2E]">
                Respostas do Aluno ({submission.questions_feedback.length})
              </h2>

              <div className="space-y-4">
                {[...submission.questions_feedback]
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

                        <p className="text-base font-semibold text-[#131B2E] whitespace-pre-line max-w-[72ch]">
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
                                  <div className="mt-1 flex flex-wrap gap-1.5">
                                    {isSelectedOption && (
                                      <span className="text-[11px] font-bold text-[#334155]">
                                        Marcada pelo aluno
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

                        <div className="rounded-lg border border-[#DCE1EB] bg-[#F8F8F5] px-4 py-3 text-xs text-[#334155]">
                          <span className="font-bold text-[#131B2E]">Resolução cadastrada:</span>{' '}
                          {item.explanation}
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

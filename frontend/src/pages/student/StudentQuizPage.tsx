import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  KeyRound,
  Lock,
  MessageSquareText,
  Send,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
} from '../../components/ui';
import { ListContextBadges, VisibilityBadge } from '../../components/shared/AccessBadges';
import { AppShell } from '../../components/layout/AppShell';
import { apiClient, ApiError } from '../../lib/apiClient';
import { formatDateTime, formatPercent, formatScoreRatio } from '../../lib/formatters';
import type { EntityId, OptionKey, StudentListDetailOut } from '../../types/api';

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];

export function StudentQuizPage() {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<StudentListDetailOut | null>(null);
  const [answers, setAnswers] = useState<Record<string, OptionKey>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [unlockCode, setUnlockCode] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [retakeReason, setRetakeReason] = useState('');
  const [requestingRetake, setRequestingRetake] = useState(false);
  const [retakeFeedback, setRetakeFeedback] = useState<string | null>(null);

  const loadQuiz = useCallback(async () => {
    if (!listId) return;
    setLoading(true);
    setError(null);
    setIsLocked(false);
    try {
      const data = await apiClient.getStudentListDetail(listId);
      setDetail(data);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 403 &&
        (err.code === 'LIST_LOCKED' || err.message.toLowerCase().includes('código de acesso'))
      ) {
        setIsLocked(true);
        setError(err.message);
      } else {
        setError(
          err instanceof ApiError ? err.message : 'Não foi possível carregar este simulado.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    void loadQuiz();
  }, [loadQuiz]);

  const handleUnlockDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listId) return;
    const trimmed = unlockCode.trim();
    if (!trimmed) {
      setUnlockError('Informe o código de acesso fornecido pelo professor.');
      return;
    }

    setUnlocking(true);
    setUnlockError(null);
    try {
      const unlocked = await apiClient.unlockStudentList(listId, trimmed);
      setDetail(unlocked);
      setIsLocked(false);
      setError(null);
      setUnlockCode('');
    } catch (err) {
      setUnlockError(
        err instanceof ApiError
          ? err.message
          : 'Código inválido ou não foi possível desbloquear este simulado.'
      );
    } finally {
      setUnlocking(false);
    }
  };

  const sortedQuestions = useMemo(() => {
    if (!detail) return [];
    return [...detail.questions].sort((a, b) => a.order_index - b.order_index);
  }, [detail]);

  const answeredCount = useMemo(() => {
    return sortedQuestions.filter((q) => Boolean(answers[String(q.id)])).length;
  }, [sortedQuestions, answers]);

  const totalQuestions = sortedQuestions.length;
  const progressPct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const handleSelectOption = (questionId: EntityId, option: OptionKey) => {
    setSubmitError(null);
    setAnswers((prev) => ({
      ...prev,
      [String(questionId)]: option,
    }));
  };

  const handleSubmitQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !listId) return;
    setSubmitError(null);

    const unanswered = sortedQuestions.find((q) => !answers[String(q.id)]);
    if (unanswered) {
      setSubmitError(
        `Responda todas as questões antes de enviar. Faltam ${
          totalQuestions - answeredCount
        } questão(ões).`
      );
      const el = document.getElementById(`question-${unanswered.id}`);
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        answers: sortedQuestions.map((q) => ({
          question_id: q.id,
          selected_option: answers[String(q.id)],
        })),
      };
      const result = await apiClient.submitQuiz(listId, payload);
      navigate(`/student/submissions/${result.submission_id}`, { replace: true });
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível enviar suas respostas. Tente novamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestRetake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listId) return;
    setRequestingRetake(true);
    setSubmitError(null);
    setRetakeFeedback(null);
    try {
      await apiClient.requestRetake(listId, retakeReason);
      setRetakeFeedback(
        'Solicitação enviada ao professor. Assim que ele autorizar, você poderá fazer uma nova tentativa.'
      );
      setRetakeReason('');
      await loadQuiz();
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível enviar a solicitação de nova tentativa.'
      );
    } finally {
      setRequestingRetake(false);
    }
  };

  const latestSubmission =
    detail && detail.past_submissions.length > 0
      ? [...detail.past_submissions].sort((a, b) => b.attempt_number - a.attempt_number)[0]
      : null;

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
        </div>

        {loading ? (
          <LoadingState label="Carregando simulado..." variant="detail" />
        ) : isLocked ? (
          <Card className="max-w-xl mx-auto">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]">
                <Lock className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h1 className="font-display text-lg font-bold text-[#131B2E]">
                  Simulado Privado Bloqueado
                </h1>
                <p className="text-sm text-[#4B5568]">
                  {error ||
                    'Este simulado exige um código de acesso para desbloqueio permanente.'}
                </p>
              </div>
            </div>

            {unlockError && (
              <Alert tone="danger" className="mt-4">
                {unlockError}
              </Alert>
            )}

            <form onSubmit={handleUnlockDirect} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="direct-unlock-code"
                  className="block text-sm font-semibold text-[#131B2E]"
                >
                  Código de acesso do simulado
                </label>
                <input
                  id="direct-unlock-code"
                  type="text"
                  autoFocus
                  autoComplete="off"
                  value={unlockCode}
                  onChange={(e) => {
                    setUnlockCode(e.target.value);
                    if (unlockError) setUnlockError(null);
                  }}
                  placeholder="Digite o código informado pelo professor"
                  className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2.5 font-mono text-base sm:text-sm tracking-wider text-[#131B2E] placeholder:font-sans placeholder:tracking-normal focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={unlocking}
                  leftIcon={<KeyRound className="h-4 w-4" />}
                >
                  Desbloquear Simulado
                </Button>
                <Link to="/student/dashboard">
                  <Button variant="ghost">Voltar</Button>
                </Link>
              </div>
            </form>
          </Card>
        ) : error ? (
          <Alert
            tone="danger"
            title="Não foi possível abrir o simulado"
            action={
              <Button variant="outline" size="sm" onClick={() => void loadQuiz()}>
                Tentar novamente
              </Button>
            }
          >
            {error}
          </Alert>
        ) : !detail ? null : (
          <>
            {/* Exam Sheet Header */}
            <div className="rounded-[10px] border border-[#DCE1EB] bg-math-grid overflow-hidden shadow-card">
              <div className="p-5 sm:p-6 flex flex-col md:flex-row md:items-start justify-between gap-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ListContextBadges
                      isStandalone={detail.is_standalone}
                      classroomName={detail.classroom_name}
                      organizationName={detail.organization_name}
                    />
                    <VisibilityBadge
                      visibility={detail.visibility}
                      entity="masculine"
                      unlocked={!detail.is_standalone && detail.visibility === 'private'}
                    />
                    {detail.can_attempt ? (
                      <Badge tone="primary" className="font-mono">
                        Tentativa #{detail.next_attempt_number}
                      </Badge>
                    ) : (
                      <Badge tone="neutral" className="font-mono">
                        Tentativas utilizadas: {detail.attempts_used}
                      </Badge>
                    )}
                  </div>
                  <h1 className="mt-3 font-display text-xl sm:text-2xl font-bold tracking-tight text-[#131B2E]">
                    {detail.title}
                  </h1>
                  <p className="mt-1 text-xs font-medium text-[#4B5568]">
                    Professor(a): {detail.teacher_name}
                  </p>
                  {detail.description ? (
                    <p className="mt-2.5 text-sm text-[#334155] max-w-[70ch] leading-relaxed">
                      {detail.description}
                    </p>
                  ) : null}
                </div>

                {detail.can_attempt && totalQuestions > 0 && (
                  <div className="shrink-0 rounded-lg border border-[#DCE1EB] bg-white/95 px-4 py-3 min-w-[210px]">
                    <div className="flex items-center justify-between text-xs font-semibold text-[#131B2E]">
                      <span>Progresso da folha</span>
                      <span className="font-mono tabular-nums">
                        {answeredCount}/{totalQuestions}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-[#EEF1F7]">
                      <div
                        className="h-full bg-[#1B4FD8] transition-all duration-200"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="h-[2px] bg-[#131B2E]" aria-hidden="true" />
            </div>

            {submitError && <Alert tone="danger">{submitError}</Alert>}
            {retakeFeedback && <Alert tone="success">{retakeFeedback}</Alert>}

            {/* Case A: Locked / Cannot attempt now -> summary + retake request */}
            {!detail.can_attempt ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 space-y-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#DCE1EB] bg-[#F8F8F5] text-[#131B2E]">
                      <Lock className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-bold text-[#131B2E]">
                        Entrega já registrada neste simulado
                      </h2>
                      <p className="mt-1 text-sm text-[#4B5568]">
                        Você já concluiu a tentativa liberada (total de tentativas usadas:{' '}
                        <span className="font-mono font-semibold tabular-nums text-[#131B2E]">
                          {detail.attempts_used}
                        </span>
                        ). Para refazer esta lista, solicite autorização ao professor.
                      </p>
                    </div>
                  </div>

                  {latestSubmission && (
                    <div className="rounded-lg border border-[#DCE1EB] bg-[#F8F8F5] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold text-[#4B5568]">
                          Última entrega —{' '}
                          <span className="font-mono">
                            Tentativa #{latestSubmission.attempt_number}
                          </span>
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-3">
                          <span className="font-display text-2xl font-bold text-[#131B2E] tabular-nums">
                            {formatPercent(latestSubmission.score_percentage)}
                          </span>
                          <span className="font-mono text-sm font-semibold text-[#334155] tabular-nums">
                            ({formatScoreRatio(
                              latestSubmission.correct_count,
                              latestSubmission.total_questions
                            )}{' '}
                            acertos)
                          </span>
                          {latestSubmission.has_teacher_comment && (
                            <Badge tone="primary">
                              <MessageSquareText className="h-3 w-3" aria-hidden="true" />
                              Comentário do professor
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-[#4B5568]">
                          Enviado em {formatDateTime(latestSubmission.submitted_at)}
                        </p>
                      </div>

                      <Link to={`/student/submissions/${latestSubmission.submission_id}`}>
                        <Button variant="primary">Ver Feedback Detalhado</Button>
                      </Link>
                    </div>
                  )}

                  {detail.retake_status === 'pending' ? (
                    <Alert tone="warning" title="Solicitação pendente">
                      Você já enviou um pedido de nova tentativa. Aguarde a decisão do professor.
                    </Alert>
                  ) : (
                    <form
                      onSubmit={handleRequestRetake}
                      className="space-y-4 border-t border-[#DCE1EB] pt-5"
                    >
                      {detail.retake_status === 'rejected' && (
                        <Alert tone="info">
                          Sua solicitação anterior foi recusada pelo professor. Caso necessário,
                          envie uma nova solicitação explicando o motivo.
                        </Alert>
                      )}
                      <div>
                        <h3 className="font-display text-base font-bold text-[#131B2E]">
                          Solicitar Nova Tentativa ao Professor
                        </h3>
                        <p className="mt-1 text-sm text-[#4B5568]">
                          Explique brevemente por que deseja refazer este simulado (opcional).
                        </p>
                        <textarea
                          rows={3}
                          value={retakeReason}
                          onChange={(e) => setRetakeReason(e.target.value)}
                          placeholder="Ex.: Revisei os assuntos avaliados e gostaria de tentar novamente."
                          className="mt-2.5 block w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2.5 text-base sm:text-sm text-[#131B2E] placeholder:text-slate-400 focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                        />
                      </div>
                      <Button
                        type="submit"
                        variant="secondary"
                        isLoading={requestingRetake}
                        leftIcon={<Send className="h-4 w-4" />}
                      >
                        Solicitar Nova Tentativa
                      </Button>
                    </form>
                  )}
                </Card>

                {/* Past attempts list */}
                <Card className="space-y-4">
                  <h2 className="font-display text-base font-bold text-[#131B2E]">
                    Tentativas Anteriores ({detail.past_submissions.length})
                  </h2>
                  {detail.past_submissions.length === 0 ? (
                    <p className="text-sm text-[#4B5568]">Nenhuma entrega registrada.</p>
                  ) : (
                    <div className="divide-y divide-[#DCE1EB]">
                      {detail.past_submissions.map((sub) => (
                        <div key={String(sub.submission_id)} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm font-bold text-[#131B2E] tabular-nums">
                              Tentativa #{sub.attempt_number}
                            </span>
                            <span className="font-mono text-sm font-bold text-[#131B2E] tabular-nums">
                              {formatPercent(sub.score_percentage)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-[#4B5568]">
                            {formatDateTime(sub.submitted_at)}
                          </p>
                          <Link
                            to={`/student/submissions/${sub.submission_id}`}
                            className="mt-1.5 inline-block text-xs font-semibold text-[#1B4FD8] hover:underline"
                          >
                            Abrir gabarito e feedback
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            ) : totalQuestions === 0 ? (
              <EmptyState
                icon={<Clock className="h-6 w-6" />}
                title="Este simulado ainda não possui questões"
                description="O professor ainda está preparando as questões desta lista. Volte em breve."
              />
            ) : (
              /* Case B: Active Exam Workbook Form */
              <form onSubmit={handleSubmitQuiz} className="space-y-5">
                {/* Answer Sheet Jump Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#DCE1EB] bg-white px-4 py-3 shadow-card">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[#4B5568] mr-1">
                      Folha de questões:
                    </span>
                    {sortedQuestions.map((q, idx) => {
                      const isAnswered = Boolean(answers[String(q.id)]);
                      return (
                        <a
                          key={String(q.id)}
                          href={`#question-${q.id}`}
                          aria-label={`Ir para questão ${idx + 1}${isAnswered ? ' (respondida)' : ''}`}
                          className={clsx(
                            'inline-flex h-11 w-11 items-center justify-center rounded-lg font-mono text-xs font-bold tabular-nums transition-colors',
                            isAnswered
                              ? 'bg-[#1B4FD8] text-white'
                              : 'border border-[#CBD3E1] bg-[#F8F8F5] text-[#131B2E] hover:border-[#1B4FD8]'
                          )}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </a>
                      );
                    })}
                  </div>
                  <span className="font-mono text-xs font-semibold text-[#4B5568] tabular-nums">
                    {answeredCount} / {totalQuestions} marcadas
                  </span>
                </div>

                {/* Ruled Workbook Question Blocks */}
                <div className="space-y-4">
                  {sortedQuestions.map((question, index) => {
                    const selected = answers[String(question.id)];
                    const qCode = String(index + 1).padStart(2, '0');
                    return (
                      <div
                        key={String(question.id)}
                        id={`question-${question.id}`}
                        className="scroll-mt-20 rounded-[10px] border border-[#DCE1EB] bg-white shadow-card overflow-hidden grid grid-cols-1 md:grid-cols-[84px_1fr]"
                      >
                        {/* Index Gutter */}
                        <div className="border-b md:border-b-0 md:border-r border-[#DCE1EB] bg-[#F8F8F5] px-4 py-3 md:py-5 flex md:flex-col items-center md:items-start justify-between md:justify-start gap-2">
                          <span className="font-mono text-lg font-bold text-[#131B2E] tabular-nums">
                            {qCode}
                          </span>
                          <span className="font-mono text-[11px] font-medium text-[#4B5568] tabular-nums">
                            de {String(totalQuestions).padStart(2, '0')}
                          </span>
                        </div>

                        {/* Statement + Multiple-Choice Options */}
                        <div className="p-5 sm:p-6 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-[#4B5568]">
                              Questão {index + 1}
                            </span>
                            <Badge tone="primary">{question.topic_name}</Badge>
                          </div>

                          <p className="text-base font-semibold text-[#131B2E] leading-relaxed whitespace-pre-line max-w-[72ch]">
                            {question.statement}
                          </p>

                          <div
                            role="radiogroup"
                            aria-label={`Alternativas da questão ${index + 1}`}
                            className="space-y-2.5 pt-1"
                          >
                            {OPTION_KEYS.map((optKey) => {
                              const isSelected = selected === optKey;
                              return (
                                <label
                                  key={optKey}
                                  className={clsx(
                                    'flex min-h-[52px] items-center gap-3 rounded-lg border px-3.5 py-3 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-[#1B4FD8] focus-within:ring-offset-1',
                                    isSelected
                                      ? 'border-[#1B4FD8] bg-[#EEF3FF] ring-1 ring-[#1B4FD8]'
                                      : 'border-[#DCE1EB] bg-white hover:border-[#9AA5BC] hover:bg-[#F8F8F5]'
                                  )}
                                >
                                  <input
                                    type="radio"
                                    name={`question-${question.id}`}
                                    value={optKey}
                                    checked={isSelected}
                                    onChange={() => handleSelectOption(question.id, optKey)}
                                    className="sr-only"
                                  />
                                  <span
                                    className={clsx(
                                      'flex h-7 w-7 shrink-0 items-center justify-center rounded font-mono text-xs font-bold transition-colors',
                                      isSelected
                                        ? 'bg-[#1B4FD8] text-white'
                                        : 'border border-[#DCE1EB] bg-[#F8F8F5] text-[#131B2E]'
                                    )}
                                  >
                                    {optKey}
                                  </span>
                                  <span className="text-sm leading-relaxed text-[#131B2E]">
                                    {question.options[optKey]}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Submission Bar */}
                <div className="rounded-[10px] border border-[#131B2E]/20 bg-white p-4 sm:p-5 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 text-sm text-[#131B2E]">
                    <CheckCircle2
                      className={clsx(
                        'h-5 w-5 shrink-0',
                        answeredCount === totalQuestions ? 'text-[#0F766E]' : 'text-slate-400'
                      )}
                      aria-hidden="true"
                    />
                    <span className="tabular-nums">
                      <strong className="font-mono">{answeredCount}</strong> de{' '}
                      <strong className="font-mono">{totalQuestions}</strong> questões respondidas
                    </span>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    isLoading={submitting}
                    rightIcon={<Send className="h-4 w-4" />}
                  >
                    Enviar Simulado Completo
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

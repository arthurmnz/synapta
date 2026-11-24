import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  Building2,
  Layers,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  LoadingState,
} from '../../components/ui';
import { ListContextBadges } from '../../components/shared/AccessBadges';
import { TopicPerformanceChart } from '../../components/charts/TopicPerformanceChart';
import { AppShell } from '../../components/layout/AppShell';
import { apiClient, ApiError } from '../../lib/apiClient';
import {
  formatDateTime,
  formatPercent,
  formatRetakeStatus,
  formatScoreRatio,
  formatTopicSummary,
  getPerformanceTierMeta,
} from '../../lib/formatters';
import type {
  ClassroomRef,
  EntityId,
  ListTypeFilter,
  TeacherListSummaryOut,
  TeacherStudentDetailOut,
} from '../../types/api';

export function TeacherStudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();

  const [detail, setDetail] = useState<TeacherStudentDetailOut | null>(null);
  const [knownClassrooms, setKnownClassrooms] = useState<ClassroomRef[]>([]);
  const [standaloneLists, setStandaloneLists] = useState<TeacherListSummaryOut[]>([]);

  const [listType, setListType] = useState<ListTypeFilter>('all');
  const [organizationFilter, setOrganizationFilter] = useState('');
  const [classroomFilter, setClassroomFilter] = useState('');
  const [standaloneListFilter, setStandaloneListFilter] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [authorizingListId, setAuthorizingListId] = useState<EntityId | null>(null);

  useEffect(() => {
    apiClient
      .getTeacherLists({ listType: 'standalone' })
      .then((lists) => setStandaloneLists(lists.filter((l) => l.is_standalone)))
      .catch(() => {
        // Non-critical metadata
      });
  }, []);

  const loadStudentDetail = useCallback(
    async (params: {
      listType: ListTypeFilter;
      organizationId: string;
      classroomId: string;
      listId: string;
    }) => {
      if (!studentId) return;
      setLoading(true);
      setError(null);
      try {
        const isStandalone = params.listType === 'standalone';
        const data = await apiClient.getTeacherStudentDetail(studentId, {
          listType: params.listType,
          organizationId: isStandalone ? null : params.organizationId || null,
          classroomId: isStandalone ? null : params.classroomId || null,
          listId: isStandalone ? params.listId || null : null,
        });
        setDetail(data);
        if (
          params.listType === 'all' &&
          !params.organizationId &&
          !params.classroomId &&
          !params.listId
        ) {
          setKnownClassrooms(data.student.classrooms);
        }
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Não foi possível carregar os dados individuais do aluno.'
        );
      } finally {
        setLoading(false);
      }
    },
    [studentId]
  );

  useEffect(() => {
    void loadStudentDetail({
      listType,
      organizationId: organizationFilter,
      classroomId: classroomFilter,
      listId: standaloneListFilter,
    });
  }, [loadStudentDetail, listType, organizationFilter, classroomFilter, standaloneListFilter]);

  const handleAuthorizeRetake = async (listId: EntityId, listTitle: string) => {
    if (!detail) return;
    setAuthorizingListId(listId);
    setError(null);
    setActionMessage(null);
    try {
      await apiClient.authorizeStudentRetake(listId, detail.student.id);
      setActionMessage(
        `Nova tentativa liberada para ${detail.student.name} em "${listTitle}".`
      );
      await loadStudentDetail({
        listType,
        organizationId: organizationFilter,
        classroomId: classroomFilter,
        listId: standaloneListFilter,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível liberar a nova tentativa.'
      );
    } finally {
      setAuthorizingListId(null);
    }
  };

  const organizationOptions = useMemo(() => {
    const map = new Map<string, string>();
    const source = knownClassrooms.length > 0 ? knownClassrooms : detail?.student.classrooms ?? [];
    source.forEach((c) => {
      if (c.organization_id && c.organization_name) {
        map.set(String(c.organization_id), c.organization_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [knownClassrooms, detail?.student.classrooms]);

  const classroomOptions = useMemo(() => {
    const source = knownClassrooms.length > 0 ? knownClassrooms : detail?.student.classrooms ?? [];
    if (!organizationFilter) return source;
    return source.filter((c) => String(c.organization_id) === organizationFilter);
  }, [knownClassrooms, detail?.student.classrooms, organizationFilter]);

  // Identify latest submission per question list so "Liberar Nova Tentativa" appears once per list
  const latestSubmissionIdByList = useMemo(() => {
    const map = new Map<string, { submissionId: EntityId; attemptNumber: number }>();
    if (!detail) return map;
    detail.submissions.forEach((sub) => {
      const key = String(sub.question_list_id);
      const existing = map.get(key);
      if (!existing || sub.attempt_number > existing.attemptNumber) {
        map.set(key, {
          submissionId: sub.submission_id,
          attemptNumber: sub.attempt_number,
        });
      }
    });
    return map;
  }, [detail]);

  const strongest = detail ? formatTopicSummary(detail.summary.strongest_topic) : null;
  const weakest = detail ? formatTopicSummary(detail.summary.weakest_topic) : null;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/teacher/students"
            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#4B5568] hover:text-[#131B2E]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar para Lista de Alunos
          </Link>
        </div>

        {error && (
          <Alert
            tone="danger"
            action={
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={() =>
                  void loadStudentDetail({
                    listType,
                    organizationId: organizationFilter,
                    classroomId: classroomFilter,
                    listId: standaloneListFilter,
                  })
                }
              >
                Atualizar
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {actionMessage && <Alert tone="success">{actionMessage}</Alert>}

        {loading && !detail ? (
          <LoadingState label="Carregando perfil do aluno..." variant="detail" />
        ) : !detail ? null : (
          <>
            {/* Student Header & Unified 5-Column Metrics Ledger */}
            <div className="rounded-[10px] border border-[#DCE1EB] bg-white shadow-card overflow-hidden">
              <div className="bg-math-grid p-5 sm:p-6 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold tracking-tight text-[#131B2E]">
                    {detail.student.name}
                  </h1>
                  <p className="mt-0.5 font-mono text-xs text-[#4B5568]">{detail.student.email}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {detail.student.classrooms.map((c) => (
                      <Badge key={String(c.id)} tone="navy">
                        {c.organization_name ? (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3 w-3 opacity-80" aria-hidden="true" />
                            {c.organization_name} · {c.name}
                          </span>
                        ) : (
                          c.name
                        )}
                      </Badge>
                    ))}
                    {(detail.summary.standalone_submissions_count ?? 0) > 0 && (
                      <Badge tone="primary">
                        <Layers className="h-3 w-3" aria-hidden="true" />
                        Simulados Avulsos ({detail.summary.standalone_submissions_count})
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Scope & Hierarchy Filters */}
                <div className="flex flex-col sm:flex-row flex-wrap gap-3 shrink-0">
                  <div>
                    <span className="block text-xs font-bold text-[#131B2E] mb-1">Tipo</span>
                    <div
                      role="group"
                      aria-label="Filtrar métricas do aluno por tipo"
                      className="grid grid-cols-3 rounded-lg border border-[#CBD3E1] bg-[#EEF1F7] p-1"
                    >
                      {(
                        [
                          { value: 'all', label: 'Todos' },
                          { value: 'classroom', label: 'Turmas' },
                          { value: 'standalone', label: 'Avulsos' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setListType(opt.value);
                            setOrganizationFilter('');
                            setClassroomFilter('');
                            setStandaloneListFilter('');
                          }}
                          className={clsx(
                            'min-h-[36px] rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer',
                            listType === opt.value
                              ? 'bg-white text-[#131B2E] shadow-card'
                              : 'text-[#4B5568] hover:text-[#131B2E]'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {listType !== 'standalone' && organizationOptions.length > 0 && (
                    <div>
                      <label
                        htmlFor="student-detail-org"
                        className="block text-xs font-bold text-[#131B2E] mb-1"
                      >
                        Organização
                      </label>
                      <select
                        id="student-detail-org"
                        value={organizationFilter}
                        onChange={(e) => {
                          setOrganizationFilter(e.target.value);
                          setClassroomFilter('');
                        }}
                        className="block min-h-[44px] w-full sm:w-52 rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                      >
                        <option value="">Todas as organizações</option>
                        {organizationOptions.map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {listType !== 'standalone' && classroomOptions.length > 0 && (
                    <div>
                      <label
                        htmlFor="student-detail-classroom"
                        className="block text-xs font-bold text-[#131B2E] mb-1"
                      >
                        Turma
                      </label>
                      <select
                        id="student-detail-classroom"
                        value={classroomFilter}
                        onChange={(e) => setClassroomFilter(e.target.value)}
                        className="block min-h-[44px] w-full sm:w-52 rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                      >
                        <option value="">Todas as turmas</option>
                        {classroomOptions.map((c) => (
                          <option key={String(c.id)} value={String(c.id)}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {listType === 'standalone' && standaloneLists.length > 0 && (
                    <div>
                      <label
                        htmlFor="student-detail-standalone"
                        className="block text-xs font-bold text-[#131B2E] mb-1"
                      >
                        Simulado Avulso
                      </label>
                      <select
                        id="student-detail-standalone"
                        value={standaloneListFilter}
                        onChange={(e) => setStandaloneListFilter(e.target.value)}
                        className="block min-h-[44px] w-full sm:w-56 rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                      >
                        <option value="">Todos os simulados avulsos</option>
                        {standaloneLists.map((l) => (
                          <option key={String(l.id)} value={String(l.id)}>
                            {l.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Unified 5-Column Metrics Ledger Strip */}
              <div className="border-t border-[#DCE1EB] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#DCE1EB]">
                <div className="px-4 py-3.5 bg-white">
                  <p className="text-xs font-semibold text-[#4B5568]">Média geral</p>
                  <p className="mt-1 font-display text-2xl font-bold text-[#1B4FD8] tabular-nums">
                    {detail.summary.lists_completed_count > 0 &&
                    detail.summary.average_score_percentage !== null
                      ? formatPercent(detail.summary.average_score_percentage, 1)
                      : '—'}
                  </p>
                </div>

                <div className="px-4 py-3.5 bg-white">
                  <p className="text-xs font-semibold text-[#4B5568]">Listas concluídas</p>
                  <p className="mt-1 font-display text-2xl font-bold text-[#131B2E] tabular-nums">
                    {detail.summary.lists_completed_count}
                  </p>
                </div>

                <div className="px-4 py-3.5 bg-white">
                  <p className="text-xs font-semibold text-[#4B5568]">Total de tentativas</p>
                  <p className="mt-1 font-display text-2xl font-bold text-[#131B2E] tabular-nums">
                    {detail.summary.total_attempts_count}
                  </p>
                </div>

                <div className="px-4 py-3.5 bg-[#ECFDF5]/50">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#065F46]">
                    <Award className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Maior facilidade</span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-[#131B2E] truncate">
                    {strongest ? strongest.name : '—'}
                  </p>
                  {strongest?.accuracy !== null && strongest?.accuracy !== undefined && (
                    <p className="font-mono text-xs font-semibold text-[#065F46] tabular-nums">
                      {formatPercent(strongest.accuracy, 1)}
                    </p>
                  )}
                </div>

                <div className="px-4 py-3.5 bg-[#FFF1F2]/50">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#9F1239]">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Maior dificuldade</span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-[#131B2E] truncate">
                    {weakest ? weakest.name : '—'}
                  </p>
                  {weakest?.accuracy !== null && weakest?.accuracy !== undefined && (
                    <p className="font-mono text-xs font-semibold text-[#9F1239] tabular-nums">
                      {formatPercent(weakest.accuracy, 1)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Student Topic Performance Chart */}
            <Card>
              <CardHeader
                title="Rendimento Individual por Assunto"
                description="Percentual de acerto do aluno em cada assunto avaliado."
              />
              <div className="mt-5">
                <TopicPerformanceChart
                  topics={detail.topic_performance}
                  sortOrder="asc"
                  emptyMessage="Este aluno ainda não concluiu simulados para gerar análise por assunto."
                />
              </div>
            </Card>

            {/* Student Submissions & Retake Authorization */}
            <Card padding="none" className="overflow-hidden">
              <div className="px-6 py-5 border-b border-[#DCE1EB]">
                <h2 className="font-display text-lg font-bold text-[#131B2E]">
                  Histórico de Entregas e Tentativas ({detail.submissions.length})
                </h2>
                <p className="mt-1 text-sm text-[#4B5568]">
                  Abra qualquer entrega para revisar as respostas, adicionar comentário manual ou
                  liberar uma nova tentativa.
                </p>
              </div>

              {detail.submissions.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={<RotateCcw className="h-6 w-6" />}
                    title="Nenhuma tentativa registrada"
                    description="Este aluno ainda não enviou nenhum simulado nos filtros selecionados."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#DCE1EB] bg-[#F8F8F5] text-xs font-bold text-[#4B5568]">
                        <th className="px-5 py-3.5">Simulado / Origem</th>
                        <th className="px-5 py-3.5">Tentativa</th>
                        <th className="px-5 py-3.5">Nota</th>
                        <th className="px-5 py-3.5">Status</th>
                        <th className="px-5 py-3.5">Data</th>
                        <th className="px-5 py-3.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE1EB] text-sm">
                      {detail.submissions.map((sub) => {
                        const tier = getPerformanceTierMeta(sub.score_percentage);
                        const retake = formatRetakeStatus(sub.retake_status);
                        const isLatestForList =
                          latestSubmissionIdByList.get(String(sub.question_list_id))
                            ?.submissionId === sub.submission_id;

                        const canShowAuthorizeBtn =
                          isLatestForList &&
                          sub.retake_status !== 'approved' &&
                          sub.can_authorize_retake;

                        return (
                          <tr key={String(sub.submission_id)} className="hover:bg-[#F8F8F5]/70">
                            <td className="px-5 py-4 space-y-1">
                              <p className="font-bold text-[#131B2E]">{sub.question_list_title}</p>
                              <div className="flex flex-wrap gap-1.5">
                                <ListContextBadges
                                  isStandalone={sub.is_standalone}
                                  classroomName={sub.classroom_name}
                                  organizationName={sub.organization_name}
                                />
                              </div>
                            </td>
                            <td className="px-5 py-4 tabular-nums">
                              <Badge tone="navy" className="font-mono">
                                Tentativa #{sub.attempt_number} de {sub.attempts_on_list}
                              </Badge>
                            </td>
                            <td className="px-5 py-4 tabular-nums">
                              <div className="flex items-center gap-2">
                                <Badge tone={tier.badgeTone} className="font-mono">
                                  {formatPercent(sub.score_percentage)}
                                </Badge>
                                <span className="font-mono text-xs text-[#4B5568]">
                                  ({formatScoreRatio(sub.correct_count, sub.total_questions)})
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex flex-col items-start gap-1">
                                {Boolean(sub.teacher_comment) && (
                                  <Badge tone="primary">
                                    <MessageSquareText className="h-3 w-3" aria-hidden="true" />
                                    Com comentário
                                  </Badge>
                                )}
                                {sub.retake_status === 'approved' ? (
                                  <Badge tone="success">Nova tentativa liberada</Badge>
                                ) : sub.retake_status !== 'none' ? (
                                  <Badge tone={retake.tone}>{retake.label}</Badge>
                                ) : (
                                  <span className="text-xs text-[#4B5568]">Concluída</span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-4 text-xs text-[#4B5568] whitespace-nowrap">
                              {formatDateTime(sub.submitted_at)}
                            </td>
                            <td className="px-5 py-4 text-right whitespace-nowrap">
                              <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                {canShowAuthorizeBtn && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    isLoading={authorizingListId === sub.question_list_id}
                                    disabled={
                                      authorizingListId !== null &&
                                      authorizingListId !== sub.question_list_id
                                    }
                                    leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                                    onClick={() =>
                                      void handleAuthorizeRetake(
                                        sub.question_list_id,
                                        sub.question_list_title
                                      )
                                    }
                                  >
                                    Liberar Nova Tentativa
                                  </Button>
                                )}
                                <Link to={`/teacher/submissions/${sub.submission_id}`}>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                                  >
                                    Abrir Entrega
                                  </Button>
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

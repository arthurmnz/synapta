import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Award,
  Check,
  Clock,
  Layers,
  RefreshCw,
  Users,
  X,
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
  getPerformanceTierMeta,
} from '../../lib/formatters';
import type {
  AnalyticsScope,
  EntityId,
  ListTypeFilter,
  RetakeRequestOut,
  TeacherClassroomOut,
  TeacherListSummaryOut,
  TeacherOrganizationOut,
  TeacherTopicAnalyticsOut,
} from '../../types/api';

export function TeacherDashboardPage() {
  const [organizations, setOrganizations] = useState<TeacherOrganizationOut[]>([]);
  const [classrooms, setClassrooms] = useState<TeacherClassroomOut[]>([]);
  const [lists, setLists] = useState<TeacherListSummaryOut[]>([]);
  const [analytics, setAnalytics] = useState<TeacherTopicAnalyticsOut | null>(null);
  const [retakeRequests, setRetakeRequests] = useState<RetakeRequestOut[]>([]);

  const [filterMode, setFilterMode] = useState<ListTypeFilter>('all');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [scope, setScope] = useState<AnalyticsScope>('latest');

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<EntityId | null>(null);

  const loadMetadataAndQueue = useCallback(async () => {
    setError(null);
    try {
      const [orgs, cls, allLists, pending] = await Promise.all([
        apiClient.getTeacherOrganizations().catch(() => [] as TeacherOrganizationOut[]),
        apiClient.getTeacherClassrooms(),
        apiClient.getTeacherLists(),
        apiClient.getRetakeRequests('pending'),
      ]);
      setOrganizations(orgs);
      setClassrooms(cls);
      setLists(allLists);
      setRetakeRequests(pending);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar os dados iniciais do painel.'
      );
    }
  }, []);

  const loadAnalytics = useCallback(
    async (params: {
      listType: ListTypeFilter;
      organizationId: string;
      classroomId: string;
      listId: string;
      scope: AnalyticsScope;
    }) => {
      setLoadingAnalytics(true);
      try {
        const isStandaloneMode = params.listType === 'standalone';
        const data = await apiClient.getTopicAnalytics({
          listType: params.listType,
          organizationId: isStandaloneMode ? null : params.organizationId || null,
          classroomId: isStandaloneMode ? null : params.classroomId || null,
          listId: params.listId || null,
          scope: params.scope,
        });
        setAnalytics(data);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Não foi possível carregar a análise de assuntos.'
        );
      } finally {
        setLoadingAnalytics(false);
        setLoadingInitial(false);
      }
    },
    []
  );

  useEffect(() => {
    void (async () => {
      await loadMetadataAndQueue();
      await loadAnalytics({
        listType: 'all',
        organizationId: '',
        classroomId: '',
        listId: '',
        scope: 'latest',
      });
    })();
  }, [loadMetadataAndQueue, loadAnalytics]);

  const memberOrganizations = useMemo(
    () => organizations.filter((o) => o.is_member),
    [organizations]
  );

  const visibleClassrooms = useMemo(() => {
    if (!selectedOrgId) return classrooms;
    return classrooms.filter((c) => String(c.organization_id) === selectedOrgId);
  }, [classrooms, selectedOrgId]);

  const visibleClassroomLists = useMemo(() => {
    return lists.filter((l) => {
      if (l.is_standalone) return false;
      if (selectedClassroomId) return String(l.classroom_id) === selectedClassroomId;
      if (selectedOrgId) return String(l.organization_id) === selectedOrgId;
      return true;
    });
  }, [lists, selectedOrgId, selectedClassroomId]);

  const standaloneLists = useMemo(
    () => lists.filter((l) => l.is_standalone),
    [lists]
  );

  const handleModeChange = (nextMode: ListTypeFilter) => {
    setFilterMode(nextMode);
    setSelectedOrgId('');
    setSelectedClassroomId('');
    setSelectedListId('');
    void loadAnalytics({
      listType: nextMode,
      organizationId: '',
      classroomId: '',
      listId: '',
      scope,
    });
  };

  const handleOrgFilterChange = (newOrgId: string) => {
    setSelectedOrgId(newOrgId);
    setSelectedClassroomId('');
    setSelectedListId('');
    void loadAnalytics({
      listType: filterMode,
      organizationId: newOrgId,
      classroomId: '',
      listId: '',
      scope,
    });
  };

  const handleClassroomFilterChange = (newClassroomId: string) => {
    setSelectedClassroomId(newClassroomId);
    setSelectedListId('');
    void loadAnalytics({
      listType: filterMode,
      organizationId: selectedOrgId,
      classroomId: newClassroomId,
      listId: '',
      scope,
    });
  };

  const handleListFilterChange = (newListId: string) => {
    setSelectedListId(newListId);
    void loadAnalytics({
      listType: filterMode,
      organizationId: selectedOrgId,
      classroomId: selectedClassroomId,
      listId: newListId,
      scope,
    });
  };

  const handleSelectStandaloneList = (listId: EntityId) => {
    const idStr = String(listId);
    setFilterMode('standalone');
    setSelectedOrgId('');
    setSelectedClassroomId('');
    setSelectedListId(idStr);
    void loadAnalytics({
      listType: 'standalone',
      organizationId: '',
      classroomId: '',
      listId: idStr,
      scope,
    });
  };

  const handleScopeChange = (newScope: AnalyticsScope) => {
    setScope(newScope);
    void loadAnalytics({
      listType: filterMode,
      organizationId: selectedOrgId,
      classroomId: selectedClassroomId,
      listId: selectedListId,
      scope: newScope,
    });
  };

  const handleDecideRetake = async (requestId: EntityId, decision: 'approved' | 'rejected') => {
    setDecidingId(requestId);
    setError(null);
    setActionMessage(null);
    try {
      const updated = await apiClient.decideRetakeRequest(requestId, decision);
      setRetakeRequests((prev) => prev.filter((item) => item.id !== requestId));
      setActionMessage(
        decision === 'approved'
          ? `Nova tentativa autorizada para ${updated.student_name} em "${updated.question_list_title}".`
          : `Solicitação de ${updated.student_name} recusada.`
      );
      await loadAnalytics({
        listType: filterMode,
        organizationId: selectedOrgId,
        classroomId: selectedClassroomId,
        listId: selectedListId,
        scope,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível processar a decisão da solicitação.'
      );
    } finally {
      setDecidingId(null);
    }
  };

  const kpis = analytics?.kpis;
  const standaloneStats = analytics?.standalone_lists ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#DCE1EB] pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#131B2E]">
              Visão Analítica
            </h1>
            <p className="mt-1 text-sm text-[#4B5568]">
              Acompanhe o rendimento multidisciplinar por assunto, filtre por organização, turma ou
              simulado avulso e gerencie pedidos de nova tentativa.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/teacher/organizations">
              <Button variant="outline">Organizações</Button>
            </Link>
            <Link to="/teacher/classrooms">
              <Button variant="primary">Gerenciar Turmas e Simulados</Button>
            </Link>
            <Link to="/teacher/students">
              <Button variant="outline" leftIcon={<Users className="h-4 w-4" />}>
                Ver Alunos
              </Button>
            </Link>
          </div>
        </div>

        {error && (
          <Alert
            tone="danger"
            action={
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={() => {
                  void loadMetadataAndQueue();
                  void loadAnalytics({
                    listType: filterMode,
                    organizationId: selectedOrgId,
                    classroomId: selectedClassroomId,
                    listId: selectedListId,
                    scope,
                  });
                }}
              >
                Recarregar
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {actionMessage && <Alert tone="success">{actionMessage}</Alert>}

        {loadingInitial ? (
          <LoadingState label="Carregando painel analítico..." variant="detail" />
        ) : (
          <>
            {/* Unified Architectural KPI Ledger Strip */}
            {kpis && (
              <section
                aria-label="Indicadores gerais"
                className="rounded-[10px] border border-[#DCE1EB] bg-white shadow-card overflow-hidden grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#DCE1EB]"
              >
                <div className="px-4 py-4 border-b border-[#DCE1EB]">
                  <p className="text-xs font-semibold text-[#4B5568]">Organizações</p>
                  <p className="mt-1 font-display text-2xl font-bold text-[#131B2E] tabular-nums">
                    {kpis.total_organizations ?? 0}
                  </p>
                </div>

                <div className="px-4 py-4 border-b border-[#DCE1EB]">
                  <p className="text-xs font-semibold text-[#4B5568]">Turmas</p>
                  <p className="mt-1 font-display text-2xl font-bold text-[#131B2E] tabular-nums">
                    {kpis.total_classrooms}
                  </p>
                </div>

                <div className="px-4 py-4 border-b border-[#DCE1EB]">
                  <p className="text-xs font-semibold text-[#4B5568]">Alunos</p>
                  <p className="mt-1 font-display text-2xl font-bold text-[#131B2E] tabular-nums">
                    {kpis.total_students}
                  </p>
                </div>

                <div className="px-4 py-4 border-b border-[#DCE1EB]">
                  <p className="text-xs font-semibold text-[#4B5568]">Simulados publicados</p>
                  <p className="mt-1 font-display text-2xl font-bold text-[#131B2E] tabular-nums">
                    {kpis.total_published_lists}
                  </p>
                </div>

                <div className="px-4 py-4">
                  <p className="text-xs font-semibold text-[#4B5568]">Simulados avulsos</p>
                  <p className="mt-1 font-display text-2xl font-bold text-[#131B2E] tabular-nums">
                    {kpis.total_standalone_lists ?? 0}
                  </p>
                </div>

                <div className="px-4 py-4">
                  <p className="text-xs font-semibold text-[#4B5568]">Submissões</p>
                  <p className="mt-1 font-display text-2xl font-bold text-[#131B2E] tabular-nums">
                    {kpis.total_submissions}
                  </p>
                </div>

                <div className="px-4 py-4">
                  <p className="text-xs font-semibold text-[#4B5568]">Média geral</p>
                  <p className="mt-1 font-display text-2xl font-bold text-[#1B4FD8] tabular-nums">
                    {formatPercent(kpis.overall_accuracy_percentage, 1)}
                  </p>
                </div>

                <div
                  className={clsx(
                    'px-4 py-4',
                    kpis.pending_retake_requests > 0 ? 'bg-[#FFFBEB]' : 'bg-white'
                  )}
                >
                  <p className="text-xs font-semibold text-[#4B5568]">Retakes pendentes</p>
                  <p
                    className={clsx(
                      'mt-1 font-display text-2xl font-bold tabular-nums',
                      kpis.pending_retake_requests > 0 ? 'text-[#92400E]' : 'text-[#131B2E]'
                    )}
                  >
                    {kpis.pending_retake_requests}
                  </p>
                </div>
              </section>
            )}

            {/* Analytics Filter Controls */}
            <Card padding="sm">
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-end">
                  <div>
                    <span className="block text-xs font-bold text-[#131B2E] mb-1.5">
                      Modo de análise
                    </span>
                    <div
                      role="group"
                      aria-label="Modo de análise"
                      className="grid grid-cols-3 rounded-lg border border-[#CBD3E1] bg-[#EEF1F7] p-1"
                    >
                      {(
                        [
                          { value: 'all', label: 'Visão Geral' },
                          { value: 'classroom', label: 'Por Organização / Turma' },
                          { value: 'standalone', label: 'Por Simulado Avulso' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleModeChange(opt.value)}
                          className={clsx(
                            'min-h-[44px] sm:min-h-[36px] rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                            filterMode === opt.value
                              ? 'bg-white text-[#131B2E] shadow-card'
                              : 'text-[#4B5568] hover:text-[#131B2E]'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="block text-xs font-bold text-[#131B2E] mb-1.5">
                      Escopo das tentativas
                    </span>
                    <div
                      role="group"
                      aria-label="Escopo das tentativas"
                      className="grid grid-cols-2 rounded-lg border border-[#CBD3E1] bg-[#EEF1F7] p-1"
                    >
                      <button
                        type="button"
                        onClick={() => handleScopeChange('latest')}
                        className={clsx(
                          'min-h-[44px] sm:min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                          scope === 'latest'
                            ? 'bg-white text-[#131B2E] shadow-card'
                            : 'text-[#4B5568] hover:text-[#131B2E]'
                        )}
                      >
                        Última tentativa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleScopeChange('all')}
                        className={clsx(
                          'min-h-[44px] sm:min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                          scope === 'all'
                            ? 'bg-white text-[#131B2E] shadow-card'
                            : 'text-[#4B5568] hover:text-[#131B2E]'
                        )}
                      >
                        Todas as tentativas
                      </button>
                    </div>
                  </div>
                </div>

                {filterMode === 'classroom' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-[#DCE1EB] pt-4">
                    <div>
                      <label
                        htmlFor="analytics-organization"
                        className="block text-xs font-bold text-[#131B2E] mb-1.5"
                      >
                        Organização
                      </label>
                      <select
                        id="analytics-organization"
                        value={selectedOrgId}
                        onChange={(e) => handleOrgFilterChange(e.target.value)}
                        className="block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                      >
                        <option value="">Todas as organizações</option>
                        {memberOrganizations.map((org) => (
                          <option key={String(org.id)} value={String(org.id)}>
                            {org.name} ({org.classroom_count} turmas)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="analytics-classroom"
                        className="block text-xs font-bold text-[#131B2E] mb-1.5"
                      >
                        Turma
                      </label>
                      <select
                        id="analytics-classroom"
                        value={selectedClassroomId}
                        onChange={(e) => handleClassroomFilterChange(e.target.value)}
                        className="block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                      >
                        <option value="">Todas as turmas ({visibleClassrooms.length})</option>
                        {visibleClassrooms.map((c) => (
                          <option key={String(c.id)} value={String(c.id)}>
                            {c.name} ({c.student_count} alunos)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="analytics-list"
                        className="block text-xs font-bold text-[#131B2E] mb-1.5"
                      >
                        Simulado da Turma
                      </label>
                      <select
                        id="analytics-list"
                        value={selectedListId}
                        onChange={(e) => handleListFilterChange(e.target.value)}
                        className="block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                      >
                        <option value="">Todos os simulados da seleção</option>
                        {visibleClassroomLists.map((l) => (
                          <option key={String(l.id)} value={String(l.id)}>
                            {l.title} ({l.classroom_name})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {filterMode === 'standalone' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[#DCE1EB] pt-4 items-center">
                    <div>
                      <label
                        htmlFor="analytics-standalone-list"
                        className="block text-xs font-bold text-[#131B2E] mb-1.5"
                      >
                        Simulado Avulso
                      </label>
                      <select
                        id="analytics-standalone-list"
                        value={selectedListId}
                        onChange={(e) => handleListFilterChange(e.target.value)}
                        className="block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                      >
                        <option value="">
                          Todos os simulados avulsos ({standaloneLists.length})
                        </option>
                        {standaloneLists.map((l) => (
                          <option key={String(l.id)} value={String(l.id)}>
                            {l.title} ({l.submission_count} entregas)
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-[#4B5568]">
                      Simulados avulsos são independentes de organizações e turmas. Selecione um
                      simulado específico acima para isolar o desempenho por assunto.
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* Main Topic Chart + Lowest/Highest Ledger */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
              <Card className="xl:col-span-2">
                <CardHeader
                  title="Rendimento por Assunto"
                  description="Assuntos ordenados do menor para o maior índice de acerto (%)."
                />
                <div className="mt-5">
                  {loadingAnalytics ? (
                    <LoadingState
                      label="Atualizando gráfico de assuntos..."
                      variant="table"
                      rows={4}
                    />
                  ) : (
                    <TopicPerformanceChart
                      topics={analytics?.topics ?? []}
                      sortOrder="asc"
                      emptyMessage="Nenhuma entrega registrada para os filtros selecionados."
                    />
                  )}
                </div>
              </Card>

              <div className="space-y-4">
                {/* Lowest performing topics */}
                <Card padding="none" className="overflow-hidden">
                  <div className="px-5 py-4 border-b border-[#DCE1EB] bg-[#FFF1F2]/60 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-[#BE123C] shrink-0" aria-hidden="true" />
                    <div>
                      <h2 className="font-display text-sm font-bold text-[#131B2E]">
                        Assuntos com Menor Rendimento
                      </h2>
                      <p className="text-xs text-[#4B5568]">Prioridade para reforço</p>
                    </div>
                  </div>

                  {!analytics || analytics.lowest_performing_topics.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-[#4B5568]">
                      Sem dados suficientes para destacar assuntos críticos.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#DCE1EB]">
                      {analytics.lowest_performing_topics.map((topic) => {
                        const meta = getPerformanceTierMeta(topic.accuracy_percentage);
                        return (
                          <div
                            key={String(topic.topic_id)}
                            className="flex items-center justify-between gap-3 px-5 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-[#131B2E]">
                                {topic.topic_name}
                              </p>
                              <p className="text-xs text-[#4B5568] tabular-nums">
                                {topic.correct_answers} de {topic.total_answers} acertos
                              </p>
                            </div>
                            <Badge tone={meta.badgeTone} className="font-mono">
                              {formatPercent(topic.accuracy_percentage, 1)}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>

                {/* Highest performing topics */}
                <Card padding="none" className="overflow-hidden">
                  <div className="px-5 py-4 border-b border-[#DCE1EB] bg-[#ECFDF5]/60 flex items-center gap-2">
                    <Award className="h-4 w-4 text-[#0F766E] shrink-0" aria-hidden="true" />
                    <div>
                      <h2 className="font-display text-sm font-bold text-[#131B2E]">
                        Assuntos com Maior Rendimento
                      </h2>
                      <p className="text-xs text-[#4B5568]">Conteúdos com melhor consolidação</p>
                    </div>
                  </div>

                  {!analytics || analytics.highest_performing_topics.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-[#4B5568]">
                      Sem dados suficientes para listar destaques.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#DCE1EB]">
                      {analytics.highest_performing_topics.map((topic) => {
                        const meta = getPerformanceTierMeta(topic.accuracy_percentage);
                        return (
                          <div
                            key={String(topic.topic_id)}
                            className="flex items-center justify-between gap-3 px-5 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-[#131B2E]">
                                {topic.topic_name}
                              </p>
                              <p className="text-xs text-[#4B5568] tabular-nums">
                                {topic.correct_answers} de {topic.total_answers} acertos
                              </p>
                            </div>
                            <Badge tone={meta.badgeTone} className="font-mono">
                              {formatPercent(topic.accuracy_percentage, 1)}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </div>
            </div>

            {/* Standalone Lists Performance Breakdown */}
            {filterMode !== 'classroom' && (standaloneStats.length > 0 || filterMode === 'standalone') && (
              <Card padding="none" className="overflow-hidden">
                <div className="px-6 py-4 border-b border-[#DCE1EB] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Layers className="h-4 w-4 text-[#1B4FD8] shrink-0" aria-hidden="true" />
                    <div>
                      <h2 className="font-display text-base font-bold text-[#131B2E]">
                        Desempenho em Simulados Avulsos ({standaloneStats.length})
                      </h2>
                      <p className="text-xs text-[#4B5568]">
                        Avaliações públicas abertas a qualquer aluno, sem vínculo com turma.
                      </p>
                    </div>
                  </div>
                  <Link to="/teacher/classrooms">
                    <Button variant="outline" size="sm">
                      Gerenciar Simulados
                    </Button>
                  </Link>
                </div>

                {standaloneStats.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      icon={<Layers className="h-6 w-6" />}
                      title="Nenhum simulado avulso publicado"
                      description="Crie um Simulado Avulso em Turmas e Simulados para disponibilizar avaliações públicas a todos os alunos."
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#DCE1EB] bg-[#F8F8F5] text-xs font-bold text-[#4B5568]">
                          <th className="px-5 py-3">Simulado Avulso</th>
                          <th className="px-5 py-3 text-right">Alunos</th>
                          <th className="px-5 py-3 text-right">Entregas</th>
                          <th className="px-5 py-3 text-right">Média Geral</th>
                          <th className="px-5 py-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#DCE1EB] text-sm">
                        {standaloneStats.map((item) => {
                          const meta = getPerformanceTierMeta(item.average_score_percentage);
                          return (
                            <tr key={String(item.list_id)} className="hover:bg-[#F8F8F5]/70">
                              <td className="px-5 py-3.5 font-bold text-[#131B2E]">
                                {item.title}
                              </td>
                              <td className="px-5 py-3.5 text-right font-mono tabular-nums text-xs text-[#4B5568]">
                                {item.distinct_students_count}
                              </td>
                              <td className="px-5 py-3.5 text-right font-mono tabular-nums text-xs text-[#4B5568]">
                                {item.submissions_count}
                              </td>
                              <td className="px-5 py-3.5 text-right tabular-nums">
                                {item.submissions_count > 0 ? (
                                  <Badge tone={meta.badgeTone} className="font-mono">
                                    {formatPercent(item.average_score_percentage, 1)}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-[#4B5568]">Sem entregas</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleSelectStandaloneList(item.list_id)}
                                  >
                                    Filtrar análise
                                  </Button>
                                  <Link to={`/teacher/lists/${item.list_id}`}>
                                    <Button variant="ghost" size="sm">
                                      Editar
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
            )}

            {/* Pending Retake Requests Queue */}
            <Card>
              <CardHeader
                title={`Solicitações de Nova Tentativa (${retakeRequests.length})`}
                description="Alunos que concluíram um simulado e solicitaram autorização para refazer."
                actions={
                  retakeRequests.length > 0 ? (
                    <Badge tone="warning">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {retakeRequests.length} pendente(s)
                    </Badge>
                  ) : undefined
                }
              />

              <div className="mt-5">
                {retakeRequests.length === 0 ? (
                  <EmptyState
                    icon={<Check className="h-6 w-6" />}
                    title="Nenhuma solicitação pendente"
                    description="Quando um aluno pedir permissão para refazer um simulado, a solicitação aparecerá aqui para aprovação ou recusa."
                  />
                ) : (
                  <div className="divide-y divide-[#DCE1EB] border border-[#DCE1EB] rounded-lg overflow-hidden">
                    {retakeRequests.map((req) => {
                      const isProcessing = decidingId === req.id;
                      return (
                        <div
                          key={String(req.id)}
                          className="p-4 bg-white flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                to={`/teacher/students/${req.student_id}`}
                                className="text-sm font-bold text-[#1B4FD8] hover:underline"
                              >
                                {req.student_name}
                              </Link>
                              <span className="font-mono text-xs text-[#4B5568]">
                                {req.student_email}
                              </span>
                              <ListContextBadges
                                isStandalone={req.is_standalone}
                                classroomName={req.classroom_name}
                                organizationName={req.organization_name}
                              />
                            </div>

                            <p className="text-sm font-semibold text-[#131B2E]">
                              Simulado: {req.question_list_title}
                            </p>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-[#4B5568] tabular-nums">
                              <span>
                                Tentativas usadas:{' '}
                                <strong className="font-mono text-[#131B2E]">
                                  {req.attempts_used}
                                </strong>
                              </span>
                              {req.last_score_percentage !== null && (
                                <span>
                                  Última nota:{' '}
                                  <strong className="font-mono text-[#131B2E]">
                                    {formatPercent(req.last_score_percentage)}
                                  </strong>
                                </span>
                              )}
                              <span>Solicitado em {formatDateTime(req.created_at)}</span>
                            </div>

                            {req.request_reason ? (
                              <p className="mt-1.5 rounded-lg bg-[#F8F8F5] border border-[#DCE1EB] px-3 py-2 text-xs text-[#334155]">
                                <span className="font-semibold">Motivo:</span> {req.request_reason}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <Button
                              variant="success"
                              size="sm"
                              isLoading={isProcessing}
                              disabled={decidingId !== null && !isProcessing}
                              leftIcon={<Check className="h-3.5 w-3.5" />}
                              onClick={() => void handleDecideRetake(req.id, 'approved')}
                            >
                              Autorizar Nova Tentativa
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={decidingId !== null}
                              leftIcon={<X className="h-3.5 w-3.5" />}
                              onClick={() => void handleDecideRetake(req.id, 'rejected')}
                            >
                              Recusar
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

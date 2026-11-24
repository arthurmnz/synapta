import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  Layers,
  Lock,
  RefreshCw,
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
import { AccessCodeModal } from '../../components/modals/AccessCodeModal';
import { ListContextBadges, VisibilityBadge } from '../../components/shared/AccessBadges';
import { AppShell } from '../../components/layout/AppShell';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient, ApiError } from '../../lib/apiClient';
import {
  formatPercent,
  formatRetakeStatus,
  getPerformanceTierMeta,
} from '../../lib/formatters';
import type {
  StudentClassroomOut,
  StudentListScopeFilter,
  StudentListSummaryOut,
  StudentOrganizationOut,
} from '../../types/api';

function StudentListCard({
  item,
  onRequestUnlock,
}: {
  item: StudentListSummaryOut;
  onRequestUnlock: (item: StudentListSummaryOut) => void;
}) {
  const retakeMeta = formatRetakeStatus(item.retake_status);
  const scoreMeta =
    item.latest_score_percentage !== null
      ? getPerformanceTierMeta(item.latest_score_percentage)
      : null;

  const isLocked = !item.is_standalone && item.visibility === 'private' && !item.is_unlocked;

  return (
    <Card className="flex flex-col justify-between gap-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <ListContextBadges
              isStandalone={item.is_standalone}
              classroomName={item.classroom_name}
              organizationName={item.organization_name}
            />
            <VisibilityBadge
              visibility={item.visibility}
              entity="masculine"
              unlocked={!item.is_standalone && item.visibility === 'private' && item.is_unlocked}
            />
          </div>

          {isLocked ? (
            <Badge tone="warning">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Bloqueado
            </Badge>
          ) : item.can_attempt ? (
            <Badge tone="primary">
              {item.attempts_used === 0
                ? 'Disponível'
                : `Tentativa #${item.attempts_used + 1} liberada`}
            </Badge>
          ) : item.retake_status === 'pending' ? (
            <Badge tone="warning">
              <Clock className="h-3 w-3" aria-hidden="true" />
              Aguardando professor
            </Badge>
          ) : (
            <Badge tone="neutral">Entregue</Badge>
          )}
        </div>

        <h3 className="mt-3 font-display text-lg font-bold text-[#131B2E] leading-snug">
          {item.title}
        </h3>
        <p className="mt-1 text-xs font-medium text-[#4B5568]">
          Professor(a): {item.teacher_name}
        </p>
        {item.description ? (
          <p className="mt-2 text-sm text-[#4B5568] line-clamp-2">{item.description}</p>
        ) : null}

        {isLocked && (
          <div className="mt-3 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs text-[#78350F]">
            Este simulado exige um código de acesso para desbloqueio permanente.
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2.5 text-xs font-semibold text-[#131B2E] tabular-nums">
          <span className="rounded-md border border-[#DCE1EB] bg-[#F8F8F5] px-2.5 py-1 font-mono">
            {item.question_count} {item.question_count === 1 ? 'questão' : 'questões'}
          </span>
          <span className="rounded-md border border-[#DCE1EB] bg-[#F8F8F5] px-2.5 py-1 font-mono">
            Tentativas: {item.attempts_used}/{item.max_attempts_available_now}
          </span>
          {scoreMeta && item.latest_score_percentage !== null && (
            <Badge tone={scoreMeta.badgeTone} className="font-mono">
              Última nota: {formatPercent(item.latest_score_percentage)}
            </Badge>
          )}
        </div>

        {!isLocked && !item.can_attempt && item.retake_status !== 'none' && (
          <p className="mt-2.5 text-xs font-medium text-[#4B5568]">
            Status de nova tentativa:{' '}
            <span className="font-semibold text-[#131B2E]">{retakeMeta.label}</span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#DCE1EB] pt-4">
        {item.latest_submission_id ? (
          <Link to={`/student/submissions/${item.latest_submission_id}`}>
            <Button variant="outline" size="sm">
              Ver Feedback
            </Button>
          </Link>
        ) : (
          <span className="text-xs text-[#4B5568]">Nenhuma entrega realizada</span>
        )}

        {isLocked ? (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Lock className="h-3.5 w-3.5" />}
            onClick={() => onRequestUnlock(item)}
          >
            Desbloquear com Código
          </Button>
        ) : item.can_attempt ? (
          <Link to={`/student/lists/${item.id}`}>
            <Button
              variant="primary"
              size="sm"
              rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
            >
              {item.attempts_used === 0
                ? 'Responder Simulado'
                : `Iniciar Tentativa #${item.attempts_used + 1}`}
            </Button>
          </Link>
        ) : (
          <Link to={`/student/lists/${item.id}`}>
            <Button variant="secondary" size="sm">
              {item.retake_status === 'pending'
                ? 'Ver Solicitação'
                : 'Solicitar Nova Tentativa'}
            </Button>
          </Link>
        )}
      </div>
    </Card>
  );
}

export function StudentDashboardPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialClassroom = searchParams.get('classroom') || '';

  const [scopeFilter, setScopeFilter] = useState<StudentListScopeFilter>(
    initialClassroom ? 'classroom' : 'all'
  );
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>(initialClassroom);

  const [organizations, setOrganizations] = useState<StudentOrganizationOut[]>([]);
  const [classrooms, setClassrooms] = useState<StudentClassroomOut[]>([]);
  const [lists, setLists] = useState<StudentListSummaryOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<StudentListSummaryOut | null>(null);

  const loadData = useCallback(
    async (params: {
      scope: StudentListScopeFilter;
      organizationId: string;
      classroomId: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const isStandaloneOnly = params.scope === 'standalone';
        const hasHierarchyFilter = Boolean(params.organizationId || params.classroomId);

        const [orgs, enrolledClassrooms, studentLists] = await Promise.all([
          apiClient.getStudentOrganizations().catch(() => [] as StudentOrganizationOut[]),
          apiClient.getStudentClassrooms(),
          hasHierarchyFilter || isStandaloneOnly || params.scope !== 'all'
            ? apiClient.getStudentLists({
                scope: params.scope,
                organizationId: isStandaloneOnly ? null : params.organizationId || null,
                classroomId: isStandaloneOnly ? null : params.classroomId || null,
              })
            : apiClient.getStudentLists(),
        ]);
        setOrganizations(orgs);
        setClassrooms(enrolledClassrooms);
        setLists(studentLists);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Não foi possível carregar suas turmas e simulados.'
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadData({
      scope: scopeFilter,
      organizationId: selectedOrgId,
      classroomId: selectedClassroomId,
    });
  }, [loadData, scopeFilter, selectedOrgId, selectedClassroomId]);

  const handleScopeChange = (nextScope: StudentListScopeFilter) => {
    setScopeFilter(nextScope);
    if (nextScope === 'standalone') {
      setSelectedOrgId('');
      setSelectedClassroomId('');
      setSearchParams({});
    }
  };

  const handleOrgChange = (value: string) => {
    setSelectedOrgId(value);
    setSelectedClassroomId('');
    setSearchParams({});
    if (value && scopeFilter === 'standalone') {
      setScopeFilter('all');
    }
  };

  const handleClassroomChange = (value: string) => {
    setSelectedClassroomId(value);
    if (value) {
      setSearchParams({ classroom: value });
      if (scopeFilter === 'standalone') {
        setScopeFilter('classroom');
      }
    } else {
      setSearchParams({});
    }
  };

  const visibleOrganizations = useMemo(() => {
    const map = new Map<string, string>();
    organizations.forEach((o) => {
      if (o.is_member || o.visibility === 'public') {
        map.set(String(o.id), o.name);
      }
    });
    classrooms.forEach((c) => {
      if (c.organization_id && c.organization_name) {
        map.set(String(c.organization_id), c.organization_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [organizations, classrooms]);

  const visibleClassrooms = useMemo(() => {
    if (!selectedOrgId) return classrooms;
    return classrooms.filter((c) => String(c.organization_id) === selectedOrgId);
  }, [classrooms, selectedOrgId]);

  const classroomLists = useMemo(
    () => lists.filter((l) => !l.is_standalone),
    [lists]
  );

  const standaloneLists = useMemo(
    () => lists.filter((l) => l.is_standalone),
    [lists]
  );

  const stats = useMemo(() => {
    const availableToAnswer = lists.filter((l) => l.can_attempt && l.is_unlocked).length;
    const completed = lists.filter((l) => l.attempts_used > 0).length;
    return {
      classroomsCount: classrooms.length,
      availableToAnswer,
      completed,
    };
  }, [classrooms.length, lists]);

  const showClassroomSection = scopeFilter !== 'standalone';
  const showStandaloneSection =
    scopeFilter !== 'classroom' && !selectedOrgId && !selectedClassroomId;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#DCE1EB] pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#131B2E]">
              Olá, {user?.name?.split(' ')[0] ?? 'Aluno'}
            </h1>
            <p className="mt-1 text-sm text-[#4B5568]">
              Acompanhe os simulados das suas turmas, resolva simulados avulsos públicos e revise
              seus feedbacks por assunto.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/student/organizations">
              <Button variant="outline" leftIcon={<Building2 className="h-4 w-4" />}>
                Organizações
              </Button>
            </Link>
            <Link to="/student/classrooms">
              <Button variant="outline" leftIcon={<BookOpen className="h-4 w-4" />}>
                Escolher Turmas
              </Button>
            </Link>
            <Link to="/student/history">
              <Button variant="secondary">Histórico</Button>
            </Link>
          </div>
        </div>

        {error && (
          <Alert
            tone="danger"
            title="Erro ao carregar dados"
            action={
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={() =>
                  void loadData({
                    scope: scopeFilter,
                    organizationId: selectedOrgId,
                    classroomId: selectedClassroomId,
                  })
                }
              >
                Tentar novamente
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {feedback && <Alert tone="success">{feedback}</Alert>}

        {/* Unified Student Metric Strip */}
        {!loading && !error && (
          <div className="rounded-[10px] border border-[#DCE1EB] bg-white shadow-card overflow-hidden grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#DCE1EB]">
            <div className="px-5 py-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#4B5568]">Turmas matriculadas</p>
                <p className="mt-1 font-display text-2xl font-bold text-[#131B2E] tabular-nums">
                  {stats.classroomsCount}
                </p>
              </div>
              <BookOpen className="h-5 w-5 text-[#131B2E]/60 shrink-0" aria-hidden="true" />
            </div>

            <div className="px-5 py-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#4B5568]">Liberados para responder</p>
                <p className="mt-1 font-display text-2xl font-bold text-[#1B4FD8] tabular-nums">
                  {stats.availableToAnswer}
                </p>
              </div>
              <ClipboardList className="h-5 w-5 text-[#1B4FD8] shrink-0" aria-hidden="true" />
            </div>

            <div className="px-5 py-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#4B5568]">Simulados concluídos</p>
                <p className="mt-1 font-display text-2xl font-bold text-[#0F766E] tabular-nums">
                  {stats.completed}
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-[#0F766E] shrink-0" aria-hidden="true" />
            </div>
          </div>
        )}

        {/* Scope & Hierarchy Filter Bar */}
        <Card padding="sm">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
            <div>
              <span className="block text-xs font-bold text-[#131B2E] mb-1.5">
                Exibir simulados
              </span>
              <div
                role="group"
                aria-label="Filtrar tipo de simulado"
                className="grid grid-cols-3 rounded-lg border border-[#CBD3E1] bg-[#EEF1F7] p-1"
              >
                {(
                  [
                    { value: 'all', label: 'Todos' },
                    { value: 'classroom', label: 'Minhas Turmas' },
                    { value: 'standalone', label: 'Avulsos' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleScopeChange(opt.value)}
                    className={clsx(
                      'min-h-[44px] sm:min-h-[36px] rounded-md px-2 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                      scopeFilter === opt.value
                        ? 'bg-white text-[#131B2E] shadow-card'
                        : 'text-[#4B5568] hover:text-[#131B2E]'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {scopeFilter !== 'standalone' && (
              <>
                <div>
                  <label
                    htmlFor="student-org-filter"
                    className="block text-xs font-bold text-[#131B2E] mb-1.5"
                  >
                    Filtrar por organização
                  </label>
                  <select
                    id="student-org-filter"
                    value={selectedOrgId}
                    onChange={(e) => handleOrgChange(e.target.value)}
                    disabled={visibleOrganizations.length === 0}
                    className="min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm font-medium text-[#131B2E] disabled:bg-[#F8F8F5] disabled:text-[#4B5568] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  >
                    <option value="">Todas as organizações</option>
                    {visibleOrganizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="student-classroom-filter"
                    className="block text-xs font-bold text-[#131B2E] mb-1.5"
                  >
                    Filtrar por turma
                  </label>
                  <select
                    id="student-classroom-filter"
                    value={selectedClassroomId}
                    onChange={(e) => handleClassroomChange(e.target.value)}
                    disabled={visibleClassrooms.length === 0}
                    className="min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm font-medium text-[#131B2E] disabled:bg-[#F8F8F5] disabled:text-[#4B5568] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  >
                    <option value="">Todas as minhas turmas ({visibleClassrooms.length})</option>
                    {visibleClassrooms.map((c) => (
                      <option key={String(c.id)} value={String(c.id)}>
                        {c.name} — Prof. {c.teacher_name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </Card>

        {loading ? (
          <LoadingState label="Carregando simulados..." variant="cards" rows={3} />
        ) : (
          <div className="space-y-8">
            {/* Section 1: Classroom Lists */}
            {showClassroomSection && (
              <section aria-labelledby="student-classroom-lists-heading" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2
                      id="student-classroom-lists-heading"
                      className="font-display text-lg font-bold text-[#131B2E]"
                    >
                      Simulados das Minhas Turmas ({classroomLists.length})
                    </h2>
                    <p className="text-xs text-[#4B5568]">
                      Listas publicadas nas turmas em que você está matriculado.
                    </p>
                  </div>
                  {(selectedOrgId || selectedClassroomId) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedOrgId('');
                        setSelectedClassroomId('');
                        setSearchParams({});
                      }}
                    >
                      Limpar filtro de turma
                    </Button>
                  )}
                </div>

                {classrooms.length === 0 ? (
                  <EmptyState
                    icon={<BookOpen className="h-6 w-6" />}
                    title="Você ainda não entrou em nenhuma turma"
                    description="Escolha uma turma disponível ou ingresse em uma organização para visualizar os simulados liberados pelos professores."
                    action={
                      <div className="flex flex-wrap justify-center gap-2">
                        <Link to="/student/organizations">
                          <Button variant="outline">Explorar Organizações</Button>
                        </Link>
                        <Link to="/student/classrooms">
                          <Button variant="primary" rightIcon={<ArrowRight className="h-4 w-4" />}>
                            Explorar Turmas Disponíveis
                          </Button>
                        </Link>
                      </div>
                    }
                  />
                ) : classroomLists.length === 0 ? (
                  <EmptyState
                    icon={<ClipboardList className="h-6 w-6" />}
                    title="Nenhum simulado de turma publicado nesta seleção"
                    description="Os professores ainda não publicaram simulados para este filtro ou tente limpar a seleção."
                    action={
                      selectedClassroomId || selectedOrgId ? (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedOrgId('');
                            setSelectedClassroomId('');
                            setSearchParams({});
                          }}
                        >
                          Mostrar todas as turmas
                        </Button>
                      ) : (
                        <Link to="/student/classrooms">
                          <Button variant="outline">Ver outras turmas</Button>
                        </Link>
                      )
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {classroomLists.map((item) => (
                      <StudentListCard
                        key={String(item.id)}
                        item={item}
                        onRequestUnlock={setUnlockTarget}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Section 2: Standalone Public Lists */}
            {showStandaloneSection && (
              <section aria-labelledby="student-standalone-lists-heading" className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <Layers className="h-5 w-5 text-[#1B4FD8] shrink-0" aria-hidden="true" />
                  <div>
                    <h2
                      id="student-standalone-lists-heading"
                      className="font-display text-lg font-bold text-[#131B2E]"
                    >
                      Simulados Avulsos ({standaloneLists.length})
                    </h2>
                    <p className="text-xs text-[#4B5568]">
                      Simulados públicos abertos a qualquer aluno, sem necessidade de matrícula em
                      turma.
                    </p>
                  </div>
                </div>

                {standaloneLists.length === 0 ? (
                  <EmptyState
                    icon={<Layers className="h-6 w-6" />}
                    title="Nenhum simulado avulso disponível no momento"
                    description="Quando professores publicarem simulados avulsos abertos, eles aparecerão aqui para todos os alunos."
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {standaloneLists.map((item) => (
                      <StudentListCard
                        key={String(item.id)}
                        item={item}
                        onRequestUnlock={setUnlockTarget}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {/* Private Classroom List Unlock Modal */}
      <AccessCodeModal
        open={Boolean(unlockTarget)}
        onClose={() => setUnlockTarget(null)}
        entityType="list"
        entityName={unlockTarget?.title ?? ''}
        subtitle={
          unlockTarget
            ? `${unlockTarget.classroom_name ?? 'Turma'} · Prof. ${unlockTarget.teacher_name}`
            : undefined
        }
        onSubmit={async (code) => {
          if (!unlockTarget) return;
          const target = unlockTarget;
          await apiClient.unlockStudentList(target.id, code);
          setFeedback(
            `Simulado "${target.title}" desbloqueado permanentemente! Você já pode responder às questões.`
          );
          await loadData({
            scope: scopeFilter,
            organizationId: selectedOrgId,
            classroomId: selectedClassroomId,
          });
        }}
      />
    </AppShell>
  );
}

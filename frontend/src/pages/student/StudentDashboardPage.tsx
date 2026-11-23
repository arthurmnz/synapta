import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  RefreshCw,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
} from '../../components/ui';
import { AppShell } from '../../components/layout/AppShell';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient, ApiError } from '../../lib/apiClient';
import {
  formatPercent,
  formatRetakeStatus,
  getPerformanceTierMeta,
} from '../../lib/formatters';
import type { StudentClassroomOut, StudentListSummaryOut } from '../../types/api';

export function StudentDashboardPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialClassroom = searchParams.get('classroom') || '';

  const [selectedClassroomId, setSelectedClassroomId] = useState<string>(initialClassroom);
  const [classrooms, setClassrooms] = useState<StudentClassroomOut[]>([]);
  const [lists, setLists] = useState<StudentListSummaryOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (classroomFilter: string) => {
    setLoading(true);
    setError(null);
    try {
      const [enrolledClassrooms, studentLists] = await Promise.all([
        apiClient.getStudentClassrooms(),
        apiClient.getStudentLists(classroomFilter || null),
      ]);
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
  }, []);

  useEffect(() => {
    void loadData(selectedClassroomId);
  }, [loadData, selectedClassroomId]);

  const handleClassroomChange = (value: string) => {
    setSelectedClassroomId(value);
    if (value) {
      setSearchParams({ classroom: value });
    } else {
      setSearchParams({});
    }
  };

  const stats = useMemo(() => {
    const availableToAnswer = lists.filter((l) => l.can_attempt).length;
    const completed = lists.filter((l) => l.attempts_used > 0).length;
    return {
      classroomsCount: classrooms.length,
      availableToAnswer,
      completed,
    };
  }, [classrooms.length, lists]);

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
              Acompanhe os simulados de Matemática das suas turmas e revise seus feedbacks.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
                onClick={() => void loadData(selectedClassroomId)}
              >
                Tentar novamente
              </Button>
            }
          >
            {error}
          </Alert>
        )}

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

        {/* Filter Bar */}
        {classrooms.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[10px] border border-[#DCE1EB] bg-white px-4 py-3 shadow-card">
            <label htmlFor="student-classroom-filter" className="text-sm font-semibold text-[#131B2E]">
              Filtrar simulados por turma
            </label>
            <select
              id="student-classroom-filter"
              value={selectedClassroomId}
              onChange={(e) => handleClassroomChange(e.target.value)}
              className="min-h-[44px] w-full sm:w-72 rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm font-medium text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
            >
              <option value="">Todas as minhas turmas ({classrooms.length})</option>
              {classrooms.map((c) => (
                <option key={String(c.id)} value={String(c.id)}>
                  {c.name} — Prof. {c.teacher_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Main Content */}
        {loading ? (
          <LoadingState label="Carregando simulados..." variant="cards" rows={3} />
        ) : classrooms.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="Você ainda não entrou em nenhuma turma"
            description="Escolha uma turma disponível para visualizar os simulados de Matemática liberados pelo professor."
            action={
              <Link to="/student/classrooms">
                <Button variant="primary" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Explorar turmas disponíveis
                </Button>
              </Link>
            }
          />
        ) : lists.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title="Nenhum simulado publicado nesta seleção"
            description="O professor ainda não publicou listas de exercícios nesta turma ou tente limpar o filtro."
            action={
              selectedClassroomId ? (
                <Button variant="outline" onClick={() => handleClassroomChange('')}>
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
            {lists.map((item) => {
              const retakeMeta = formatRetakeStatus(item.retake_status);
              const scoreMeta =
                item.latest_score_percentage !== null
                  ? getPerformanceTierMeta(item.latest_score_percentage)
                  : null;

              return (
                <Card key={String(item.id)} className="flex flex-col justify-between gap-5">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge tone="navy">{item.classroom_name}</Badge>
                      {item.can_attempt ? (
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

                    <h2 className="mt-3 font-display text-lg font-bold text-[#131B2E] leading-snug">
                      {item.title}
                    </h2>
                    <p className="mt-1 text-xs font-medium text-[#4B5568]">
                      Professor(a): {item.teacher_name}
                    </p>
                    {item.description ? (
                      <p className="mt-2 text-sm text-[#4B5568] line-clamp-2">{item.description}</p>
                    ) : null}

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

                    {!item.can_attempt && item.retake_status !== 'none' && (
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

                    {item.can_attempt ? (
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
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

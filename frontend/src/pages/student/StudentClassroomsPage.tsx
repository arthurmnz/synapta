import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  PlusCircle,
  RefreshCw,
  Search,
  Users,
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
import { apiClient, ApiError } from '../../lib/apiClient';
import { formatDateShort } from '../../lib/formatters';
import type {
  AvailableClassroomOut,
  EntityId,
  StudentClassroomOut,
} from '../../types/api';

export function StudentClassroomsPage() {
  const [enrolled, setEnrolled] = useState<StudentClassroomOut[]>([]);
  const [available, setAvailable] = useState<AvailableClassroomOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [enrollingId, setEnrollingId] = useState<EntityId | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadClassrooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [myClassrooms, allAvailable] = await Promise.all([
        apiClient.getStudentClassrooms(),
        apiClient.getAvailableClassrooms(),
      ]);
      setEnrolled(myClassrooms);
      setAvailable(allAvailable);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar as turmas disponíveis.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClassrooms();
  }, [loadClassrooms]);

  const handleEnroll = async (classroom: AvailableClassroomOut) => {
    setEnrollingId(classroom.id);
    setError(null);
    setFeedback(null);
    try {
      await apiClient.enrollInClassroom(classroom.id);
      setFeedback(`Matrícula realizada na turma "${classroom.name}".`);
      await loadClassrooms();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível entrar nesta turma.'
      );
    } finally {
      setEnrollingId(null);
    }
  };

  const filteredAvailable = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.teacher_name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [available, searchQuery]);

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#DCE1EB] pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#131B2E]">
              Turmas de Matemática
            </h1>
            <p className="mt-1 text-sm text-[#4B5568]">
              Escolha as turmas em que deseja participar para ter acesso às listas de exercícios.
            </p>
          </div>
          <Link to="/student/dashboard">
            <Button variant="outline">Voltar aos Simulados</Button>
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
                onClick={() => void loadClassrooms()}
              >
                Atualizar
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {feedback && <Alert tone="success">{feedback}</Alert>}

        {loading ? (
          <LoadingState label="Carregando turmas..." variant="cards" rows={3} />
        ) : (
          <>
            {/* Enrolled classrooms */}
            <section aria-labelledby="enrolled-heading" className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 id="enrolled-heading" className="text-lg font-bold text-slate-900">
                  Minhas Turmas ({enrolled.length})
                </h2>
              </div>

              {enrolled.length === 0 ? (
                <EmptyState
                  icon={<BookOpen className="h-6 w-6" />}
                  title="Nenhuma matrícula ativa"
                  description="Escolha uma turma disponível abaixo e clique em Entrar na Turma para começar."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {enrolled.map((classroom) => (
                    <Card key={String(classroom.id)} className="flex flex-col justify-between gap-4">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <Badge tone="success">
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            Matriculado
                          </Badge>
                          <span className="text-xs text-slate-500 tabular-nums">
                            Desde {formatDateShort(classroom.enrolled_at)}
                          </span>
                        </div>
                        <h3 className="mt-3 text-base font-bold text-slate-900">
                          {classroom.name}
                        </h3>
                        <p className="mt-1 text-xs font-medium text-slate-600">
                          Professor(a): {classroom.teacher_name}
                        </p>
                        {classroom.description ? (
                          <p className="mt-2 text-sm text-slate-600 line-clamp-2">
                            {classroom.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                        <span className="text-xs font-semibold text-slate-700 tabular-nums">
                          {classroom.published_lists_count}{' '}
                          {classroom.published_lists_count === 1 ? 'simulado' : 'simulados'}
                        </span>
                        <Link to={`/student/dashboard?classroom=${classroom.id}`}>
                          <Button
                            variant="primary"
                            size="sm"
                            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                          >
                            Ver simulados
                          </Button>
                        </Link>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Available classrooms catalog */}
            <section aria-labelledby="available-heading" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 id="available-heading" className="text-lg font-bold text-slate-900">
                  Turmas Disponíveis ({available.length})
                </h2>

                <div className="relative w-full sm:w-72">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar turma ou professor..."
                    aria-label="Buscar turma ou professor"
                    className="min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white pl-9 pr-3 py-2 text-base sm:text-sm text-[#131B2E] placeholder:text-slate-400 focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                </div>
              </div>

              {filteredAvailable.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-6 w-6" />}
                  title="Nenhuma turma encontrada"
                  description={
                    searchQuery
                      ? 'Nenhuma turma corresponde ao filtro digitado.'
                      : 'No momento não há turmas cadastradas pelos professores.'
                  }
                  action={
                    searchQuery ? (
                      <Button variant="outline" onClick={() => setSearchQuery('')}>
                        Limpar busca
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredAvailable.map((classroom) => {
                    const isEnrolling = enrollingId === classroom.id;
                    return (
                      <Card
                        key={String(classroom.id)}
                        className="flex flex-col justify-between gap-4"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 tabular-nums">
                              <Users className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                              {classroom.student_count}{' '}
                              {classroom.student_count === 1 ? 'aluno' : 'alunos'}
                            </span>
                            {classroom.is_enrolled ? (
                              <Badge tone="success">Já matriculado</Badge>
                            ) : (
                              <Badge tone="neutral">Aberta</Badge>
                            )}
                          </div>

                          <h3 className="mt-3 text-base font-bold text-slate-900">
                            {classroom.name}
                          </h3>
                          <p className="mt-1 text-xs font-medium text-slate-600">
                            Professor(a): {classroom.teacher_name}
                          </p>
                          {classroom.description ? (
                            <p className="mt-2 text-sm text-slate-600 line-clamp-2">
                              {classroom.description}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                          <span className="text-xs font-semibold text-slate-700 tabular-nums">
                            {classroom.published_lists_count}{' '}
                            {classroom.published_lists_count === 1 ? 'simulado' : 'simulados'}
                          </span>

                          {classroom.is_enrolled ? (
                            <Link to={`/student/dashboard?classroom=${classroom.id}`}>
                              <Button variant="outline" size="sm">
                                Acessar turma
                              </Button>
                            </Link>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              isLoading={isEnrolling}
                              disabled={enrollingId !== null && !isEnrolling}
                              leftIcon={<PlusCircle className="h-3.5 w-3.5" />}
                              onClick={() => void handleEnroll(classroom)}
                            >
                              Entrar na Turma
                            </Button>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

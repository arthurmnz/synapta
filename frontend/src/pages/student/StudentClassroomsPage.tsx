import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  Lock,
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
import { AccessCodeModal } from '../../components/modals/AccessCodeModal';
import { VisibilityBadge } from '../../components/shared/AccessBadges';
import { AppShell } from '../../components/layout/AppShell';
import { apiClient, ApiError } from '../../lib/apiClient';
import { formatDateShort } from '../../lib/formatters';
import type {
  AvailableClassroomOut,
  EntityId,
  StudentClassroomOut,
  StudentOrganizationOut,
} from '../../types/api';

export function StudentClassroomsPage() {
  const [organizations, setOrganizations] = useState<StudentOrganizationOut[]>([]);
  const [enrolled, setEnrolled] = useState<StudentClassroomOut[]>([]);
  const [available, setAvailable] = useState<AvailableClassroomOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [enrollingId, setEnrollingId] = useState<EntityId | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<AvailableClassroomOut | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [orgFilter, setOrgFilter] = useState('');

  const loadClassrooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgs, myClassrooms, allAvailable] = await Promise.all([
        apiClient.getStudentOrganizations().catch(() => [] as StudentOrganizationOut[]),
        apiClient.getStudentClassrooms(),
        apiClient.getAvailableClassrooms(),
      ]);
      setOrganizations(orgs);
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

  const handleEnrollPublic = async (classroom: AvailableClassroomOut) => {
    setEnrollingId(classroom.id);
    setError(null);
    setFeedback(null);
    try {
      await apiClient.enrollInClassroom(classroom.id);
      setFeedback(`Matrícula realizada na turma "${classroom.name}".`);
      await loadClassrooms();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível entrar nesta turma.'
      );
    } finally {
      setEnrollingId(null);
    }
  };

  const orgOptions = useMemo(() => {
    const map = new Map<string, string>();
    organizations.forEach((o) => {
      if (o.visibility === 'public' || o.is_member) {
        map.set(String(o.id), o.name);
      }
    });
    available.forEach((c) => {
      if (c.organization_id && c.organization_name) {
        map.set(String(c.organization_id), c.organization_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [organizations, available]);

  const filteredAvailable = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return available.filter((c) => {
      if (orgFilter === '__none__' && c.organization_id) return false;
      if (orgFilter && orgFilter !== '__none__' && String(c.organization_id) !== orgFilter) {
        return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.teacher_name.toLowerCase().includes(q) ||
        (c.organization_name && c.organization_name.toLowerCase().includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q))
      );
    });
  }, [available, searchQuery, orgFilter]);

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#DCE1EB] pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#131B2E]">
              Turmas
            </h1>
            <p className="mt-1 text-sm text-[#4B5568]">
              Escolha as turmas em que deseja participar para ter acesso aos simulados
              multidisciplinares.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/student/organizations">
              <Button variant="outline" leftIcon={<Building2 className="h-4 w-4" />}>
                Explorar Organizações
              </Button>
            </Link>
            <Link to="/student/dashboard">
              <Button variant="secondary">Voltar aos Simulados</Button>
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
                <h2 id="enrolled-heading" className="font-display text-lg font-bold text-[#131B2E]">
                  Minhas Turmas ({enrolled.length})
                </h2>
              </div>

              {enrolled.length === 0 ? (
                <EmptyState
                  icon={<BookOpen className="h-6 w-6" />}
                  title="Nenhuma matrícula ativa"
                  description="Escolha uma turma disponível abaixo ou explore uma organização para começar."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {enrolled.map((classroom) => (
                    <Card key={String(classroom.id)} className="flex flex-col justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone="success">
                              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                              Matriculado
                            </Badge>
                            <VisibilityBadge visibility={classroom.visibility} entity="feminine" />
                          </div>
                          <span className="text-xs text-[#4B5568] tabular-nums">
                            Desde {formatDateShort(classroom.enrolled_at)}
                          </span>
                        </div>

                        <div className="mt-2.5">
                          {classroom.organization_name ? (
                            <Badge tone="neutral">
                              <Building2 className="h-3 w-3" aria-hidden="true" />
                              {classroom.organization_name}
                            </Badge>
                          ) : (
                            <Badge tone="neutral">Turma independente</Badge>
                          )}
                        </div>

                        <h3 className="mt-2.5 font-display text-base font-bold text-[#131B2E]">
                          {classroom.name}
                        </h3>
                        <p className="mt-1 text-xs font-medium text-[#4B5568]">
                          Professor(a): {classroom.teacher_name}
                        </p>
                        {classroom.description ? (
                          <p className="mt-2 text-sm text-[#4B5568] line-clamp-2">
                            {classroom.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between border-t border-[#DCE1EB] pt-3">
                        <span className="text-xs font-semibold text-[#334155] tabular-nums">
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
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <h2 id="available-heading" className="font-display text-lg font-bold text-[#131B2E]">
                  Turmas Disponíveis ({filteredAvailable.length})
                </h2>

                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                  {orgOptions.length > 0 && (
                    <select
                      aria-label="Filtrar turmas por organização"
                      value={orgFilter}
                      onChange={(e) => setOrgFilter(e.target.value)}
                      className="min-h-[44px] w-full sm:w-64 rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                    >
                      <option value="">Todas as organizações</option>
                      <option value="__none__">Turmas independentes</option>
                      {orgOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="relative w-full sm:w-72">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar turma, professor ou org..."
                      aria-label="Buscar turma ou professor"
                      className="min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white pl-9 pr-3 py-2 text-base sm:text-sm text-[#131B2E] placeholder:text-slate-400 focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                    />
                  </div>
                </div>
              </div>

              {filteredAvailable.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-6 w-6" />}
                  title="Nenhuma turma encontrada"
                  description={
                    searchQuery || orgFilter
                      ? 'Nenhuma turma corresponde aos filtros selecionados. Turmas de organizações privadas aparecem após desbloquear a organização.'
                      : 'No momento não há turmas cadastradas nos espaços em que você participa.'
                  }
                  action={
                    searchQuery || orgFilter ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearchQuery('');
                          setOrgFilter('');
                        }}
                      >
                        Limpar filtros
                      </Button>
                    ) : (
                      <Link to="/student/organizations">
                        <Button variant="outline">Explorar Organizações</Button>
                      </Link>
                    )
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
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4B5568] tabular-nums">
                              <Users className="h-3.5 w-3.5 text-[#4B5568]" aria-hidden="true" />
                              {classroom.student_count}{' '}
                              {classroom.student_count === 1 ? 'aluno' : 'alunos'}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <VisibilityBadge visibility={classroom.visibility} entity="feminine" />
                              {classroom.is_enrolled && (
                                <Badge tone="success">Já matriculado</Badge>
                              )}
                            </div>
                          </div>

                          <div className="mt-2.5">
                            {classroom.organization_name ? (
                              <Badge tone="neutral">
                                <Building2 className="h-3 w-3" aria-hidden="true" />
                                {classroom.organization_name}
                              </Badge>
                            ) : (
                              <Badge tone="neutral">Turma independente</Badge>
                            )}
                          </div>

                          <h3 className="mt-2.5 font-display text-base font-bold text-[#131B2E]">
                            {classroom.name}
                          </h3>
                          <p className="mt-1 text-xs font-medium text-[#4B5568]">
                            Professor(a): {classroom.teacher_name}
                          </p>
                          {classroom.description ? (
                            <p className="mt-2 text-sm text-[#4B5568] line-clamp-2">
                              {classroom.description}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between border-t border-[#DCE1EB] pt-3">
                          <span className="text-xs font-semibold text-[#334155] tabular-nums">
                            {classroom.published_lists_count}{' '}
                            {classroom.published_lists_count === 1 ? 'simulado' : 'simulados'}
                          </span>

                          {classroom.is_enrolled ? (
                            <Link to={`/student/dashboard?classroom=${classroom.id}`}>
                              <Button variant="outline" size="sm">
                                Acessar turma
                              </Button>
                            </Link>
                          ) : classroom.visibility === 'private' ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              leftIcon={<Lock className="h-3.5 w-3.5" />}
                              onClick={() => setUnlockTarget(classroom)}
                            >
                              Entrar com Código
                            </Button>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              isLoading={isEnrolling}
                              disabled={enrollingId !== null && !isEnrolling}
                              leftIcon={<PlusCircle className="h-3.5 w-3.5" />}
                              onClick={() => void handleEnrollPublic(classroom)}
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

      {/* Private Classroom Access Code Modal */}
      <AccessCodeModal
        open={Boolean(unlockTarget)}
        onClose={() => setUnlockTarget(null)}
        entityType="classroom"
        entityName={unlockTarget?.name ?? ''}
        subtitle={
          unlockTarget ? `Professor(a): ${unlockTarget.teacher_name}` : undefined
        }
        onSubmit={async (code) => {
          if (!unlockTarget) return;
          const target = unlockTarget;
          await apiClient.enrollInClassroom(target.id, code);
          setFeedback(`Matrícula realizada na turma privada "${target.name}".`);
          await loadClassrooms();
        }}
      />
    </AppShell>
  );
}

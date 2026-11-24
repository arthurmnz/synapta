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
  X,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
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
  StudentOrganizationOut,
} from '../../types/api';

export function StudentOrganizationsPage() {
  const [organizations, setOrganizations] = useState<StudentOrganizationOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Join organization
  const [joiningOrgId, setJoiningOrgId] = useState<EntityId | null>(null);
  const [orgCodeTarget, setOrgCodeTarget] = useState<StudentOrganizationOut | null>(null);

  // Selected organization classrooms inspector
  const [selectedOrg, setSelectedOrg] = useState<StudentOrganizationOut | null>(null);
  const [orgClassrooms, setOrgClassrooms] = useState<AvailableClassroomOut[]>([]);
  const [loadingClassrooms, setLoadingClassrooms] = useState(false);
  const [classroomsError, setClassroomsError] = useState<string | null>(null);

  // Enroll in classroom inside organization
  const [enrollingClassroomId, setEnrollingClassroomId] = useState<EntityId | null>(null);
  const [classroomCodeTarget, setClassroomCodeTarget] = useState<AvailableClassroomOut | null>(null);

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getStudentOrganizations();
      setOrganizations(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar as organizações disponíveis.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  const loadOrgClassrooms = useCallback(async (org: StudentOrganizationOut) => {
    setSelectedOrg(org);
    setLoadingClassrooms(true);
    setClassroomsError(null);
    try {
      const data = await apiClient.getStudentOrganizationClassrooms(org.id);
      setOrgClassrooms(data);
    } catch (err) {
      setOrgClassrooms([]);
      setClassroomsError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar as turmas desta organização.'
      );
    } finally {
      setLoadingClassrooms(false);
    }
  }, []);

  const handleJoinPublicOrg = async (org: StudentOrganizationOut) => {
    setJoiningOrgId(org.id);
    setError(null);
    setFeedback(null);
    try {
      await apiClient.joinStudentOrganization(org.id);
      setFeedback(`Você ingressou na organização "${org.name}".`);
      await loadOrganizations();
      await loadOrgClassrooms({ ...org, is_member: true });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível ingressar na organização.'
      );
    } finally {
      setJoiningOrgId(null);
    }
  };

  const handleEnrollPublicClassroom = async (classroom: AvailableClassroomOut) => {
    setEnrollingClassroomId(classroom.id);
    setError(null);
    setFeedback(null);
    try {
      await apiClient.enrollInClassroom(classroom.id);
      setFeedback(`Matrícula realizada na turma "${classroom.name}".`);
      if (selectedOrg) {
        await loadOrgClassrooms(selectedOrg);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível entrar nesta turma.'
      );
    } finally {
      setEnrollingClassroomId(null);
    }
  };

  const myOrganizations = useMemo(
    () => organizations.filter((o) => o.is_member),
    [organizations]
  );

  const catalogOrganizations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return organizations
      .filter((o) => !o.is_member)
      .filter(
        (o) =>
          !q ||
          o.name.toLowerCase().includes(q) ||
          o.owner_name.toLowerCase().includes(q) ||
          (o.description && o.description.toLowerCase().includes(q))
      );
  }, [organizations, searchQuery]);

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#DCE1EB] pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#131B2E]">
              Organizações de Ensino
            </h1>
            <p className="mt-1 text-sm text-[#4B5568]">
              Explore instituições e redes de ensino, desbloqueie organizações privadas com seu
              código e escolha suas turmas.
            </p>
          </div>
          <Link to="/student/classrooms">
            <Button variant="outline" leftIcon={<BookOpen className="h-4 w-4" />}>
              Ver Todas as Turmas
            </Button>
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
                onClick={() => void loadOrganizations()}
              >
                Atualizar
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {feedback && <Alert tone="success">{feedback}</Alert>}

        {/* Active Organization Classrooms Explorer Panel */}
        {selectedOrg && (
          <Card>
            <CardHeader
              title={`Turmas de ${selectedOrg.name}`}
              description={`Responsável: Prof. ${selectedOrg.owner_name}`}
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<X className="h-4 w-4" />}
                  onClick={() => {
                    setSelectedOrg(null);
                    setOrgClassrooms([]);
                    setClassroomsError(null);
                  }}
                >
                  Fechar painel
                </Button>
              }
            />

            <div className="mt-5">
              {loadingClassrooms ? (
                <LoadingState label="Carregando turmas da organização..." variant="cards" rows={2} />
              ) : classroomsError ? (
                <Alert
                  tone="warning"
                  action={
                    selectedOrg.visibility === 'private' && !selectedOrg.is_member ? (
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<Lock className="h-3.5 w-3.5" />}
                        onClick={() => setOrgCodeTarget(selectedOrg)}
                      >
                        Inserir Código
                      </Button>
                    ) : undefined
                  }
                >
                  {classroomsError}
                </Alert>
              ) : orgClassrooms.length === 0 ? (
                <EmptyState
                  icon={<BookOpen className="h-6 w-6" />}
                  title="Nenhuma turma cadastrada nesta organização"
                  description="Os professores desta organização ainda não criaram turmas abertas para matrícula."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {orgClassrooms.map((classroom) => {
                    const isEnrolling = enrollingClassroomId === classroom.id;
                    return (
                      <div
                        key={String(classroom.id)}
                        className="rounded-[10px] border border-[#DCE1EB] bg-[#F8F8F5] p-4 flex flex-col justify-between gap-4"
                      >
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <VisibilityBadge visibility={classroom.visibility} entity="feminine" />
                            {classroom.is_enrolled ? (
                              <Badge tone="success">
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                Matriculado
                              </Badge>
                            ) : (
                              <span className="text-xs font-medium text-[#4B5568] tabular-nums">
                                {classroom.student_count}{' '}
                                {classroom.student_count === 1 ? 'aluno' : 'alunos'}
                              </span>
                            )}
                          </div>

                          <h3 className="mt-3 font-display text-base font-bold text-[#131B2E]">
                            {classroom.name}
                          </h3>
                          <p className="mt-0.5 text-xs font-medium text-[#4B5568]">
                            Professor(a): {classroom.teacher_name}
                          </p>
                          {classroom.description ? (
                            <p className="mt-2 text-xs text-[#4B5568] line-clamp-2">
                              {classroom.description}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between gap-2 border-t border-[#DCE1EB] pt-3">
                          <span className="text-xs font-semibold text-[#4B5568] tabular-nums">
                            {classroom.published_lists_count}{' '}
                            {classroom.published_lists_count === 1 ? 'simulado' : 'simulados'}
                          </span>

                          {classroom.is_enrolled ? (
                            <Link to={`/student/dashboard?classroom=${classroom.id}`}>
                              <Button
                                variant="outline"
                                size="sm"
                                rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                              >
                                Ver Simulados
                              </Button>
                            </Link>
                          ) : classroom.visibility === 'private' ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              leftIcon={<Lock className="h-3.5 w-3.5" />}
                              onClick={() => setClassroomCodeTarget(classroom)}
                            >
                              Entrar com Código
                            </Button>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              isLoading={isEnrolling}
                              disabled={enrollingClassroomId !== null && !isEnrolling}
                              leftIcon={<PlusCircle className="h-3.5 w-3.5" />}
                              onClick={() => void handleEnrollPublicClassroom(classroom)}
                            >
                              Entrar na Turma
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        )}

        {loading ? (
          <LoadingState label="Carregando organizações..." variant="cards" rows={3} />
        ) : (
          <>
            {/* My Organizations */}
            <section aria-labelledby="student-my-orgs-heading" className="space-y-4">
              <h2
                id="student-my-orgs-heading"
                className="font-display text-lg font-bold text-[#131B2E]"
              >
                Minhas Organizações ({myOrganizations.length})
              </h2>

              {myOrganizations.length === 0 ? (
                <EmptyState
                  icon={<Building2 className="h-6 w-6" />}
                  title="Você ainda não ingressou em nenhuma organização"
                  description="Explore o catálogo abaixo para ingressar em uma organização pública ou desbloquear uma instituição privada com código de acesso."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myOrganizations.map((org) => (
                    <Card key={String(org.id)} className="flex flex-col justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge tone="success">
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            Membro
                          </Badge>
                          <VisibilityBadge
                            visibility={org.visibility}
                            entity="feminine"
                            unlocked={org.visibility === 'private'}
                          />
                        </div>

                        <h3 className="mt-3 font-display text-base font-bold text-[#131B2E]">
                          {org.name}
                        </h3>
                        <p className="mt-0.5 text-xs font-medium text-[#4B5568]">
                          Responsável: Prof. {org.owner_name}
                        </p>
                        {org.description ? (
                          <p className="mt-2 text-sm text-[#4B5568] line-clamp-2">
                            {org.description}
                          </p>
                        ) : null}
                        {org.joined_at && (
                          <p className="mt-2 text-xs text-[#64748B] tabular-nums">
                            Membro desde {formatDateShort(org.joined_at)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-[#DCE1EB] pt-3">
                        <span className="text-xs font-semibold text-[#4B5568] tabular-nums">
                          {org.total_classroom_count}{' '}
                          {org.total_classroom_count === 1 ? 'turma' : 'turmas'}
                        </span>
                        <Button
                          variant="primary"
                          size="sm"
                          rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                          onClick={() => void loadOrgClassrooms(org)}
                        >
                          Ver Turmas
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Organizations Catalog */}
            <section aria-labelledby="student-catalog-orgs-heading" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2
                  id="student-catalog-orgs-heading"
                  className="font-display text-lg font-bold text-[#131B2E]"
                >
                  Catálogo de Organizações ({catalogOrganizations.length})
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
                    placeholder="Buscar organização ou professor..."
                    aria-label="Buscar organização ou professor"
                    className="min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white pl-9 pr-3 py-2 text-base sm:text-sm text-[#131B2E] placeholder:text-slate-400 focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                </div>
              </div>

              {catalogOrganizations.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-6 w-6" />}
                  title="Nenhuma nova organização no catálogo"
                  description={
                    searchQuery
                      ? 'Nenhuma organização corresponde ao filtro digitado.'
                      : 'Você já ingressou em todas as organizações cadastradas ou não há novas organizações disponíveis.'
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
                  {catalogOrganizations.map((org) => {
                    const isJoining = joiningOrgId === org.id;
                    return (
                      <Card key={String(org.id)} className="flex flex-col justify-between gap-4">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <VisibilityBadge visibility={org.visibility} entity="feminine" />
                            <span className="font-mono text-xs text-[#4B5568] tabular-nums">
                              {org.total_classroom_count}{' '}
                              {org.total_classroom_count === 1 ? 'turma' : 'turmas'}
                            </span>
                          </div>

                          <h3 className="mt-3 font-display text-base font-bold text-[#131B2E]">
                            {org.name}
                          </h3>
                          <p className="mt-0.5 text-xs font-medium text-[#4B5568]">
                            Responsável: Prof. {org.owner_name}
                          </p>
                          {org.description ? (
                            <p className="mt-2 text-sm text-[#4B5568] line-clamp-2">
                              {org.description}
                            </p>
                          ) : null}
                          {org.visibility === 'private' && (
                            <p className="mt-2 text-xs text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded px-2.5 py-1.5">
                              Organização privada. Desbloqueie com o código para ver e ingressar nas
                              turmas.
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#DCE1EB] pt-3">
                          {org.visibility === 'private' ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="w-full"
                              leftIcon={<Lock className="h-3.5 w-3.5" />}
                              onClick={() => setOrgCodeTarget(org)}
                            >
                              Desbloquear Organização
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void loadOrgClassrooms(org)}
                              >
                                Ver Turmas
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                isLoading={isJoining}
                                disabled={joiningOrgId !== null && !isJoining}
                                leftIcon={<PlusCircle className="h-3.5 w-3.5" />}
                                onClick={() => void handleJoinPublicOrg(org)}
                              >
                                Ingressar
                              </Button>
                            </>
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

      {/* Private Organization Access Code Modal */}
      <AccessCodeModal
        open={Boolean(orgCodeTarget)}
        onClose={() => setOrgCodeTarget(null)}
        entityType="organization"
        entityName={orgCodeTarget?.name ?? ''}
        subtitle={
          orgCodeTarget ? `Responsável: Prof. ${orgCodeTarget.owner_name}` : undefined
        }
        onSubmit={async (code) => {
          if (!orgCodeTarget) return;
          const target = orgCodeTarget;
          await apiClient.joinStudentOrganization(target.id, code);
          setFeedback(
            `Organização privada "${target.name}" desbloqueada permanentemente! Suas turmas já estão visíveis abaixo.`
          );
          await loadOrganizations();
          await loadOrgClassrooms({ ...target, is_member: true });
        }}
      />

      {/* Private Classroom Enroll Modal */}
      <AccessCodeModal
        open={Boolean(classroomCodeTarget)}
        onClose={() => setClassroomCodeTarget(null)}
        entityType="classroom"
        entityName={classroomCodeTarget?.name ?? ''}
        subtitle={
          classroomCodeTarget
            ? `Professor(a): ${classroomCodeTarget.teacher_name}`
            : undefined
        }
        onSubmit={async (code) => {
          if (!classroomCodeTarget) return;
          const target = classroomCodeTarget;
          await apiClient.enrollInClassroom(target.id, code);
          setFeedback(`Matrícula realizada na turma privada "${target.name}".`);
          if (selectedOrg) {
            await loadOrgClassrooms(selectedOrg);
          }
        }}
      />
    </AppShell>
  );
}

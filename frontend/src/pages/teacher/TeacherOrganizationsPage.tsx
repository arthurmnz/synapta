import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Building2,
  Edit3,
  Globe,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
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
  Modal,
} from '../../components/ui';
import { AccessCodeModal } from '../../components/modals/AccessCodeModal';
import { AccessCodeDisplay, VisibilityBadge } from '../../components/shared/AccessBadges';
import { AppShell } from '../../components/layout/AppShell';
import { apiClient, ApiError } from '../../lib/apiClient';
import type { EntityId, TeacherOrganizationOut, VisibilityType } from '../../types/api';

export function TeacherOrganizationsPage() {
  const [organizations, setOrganizations] = useState<TeacherOrganizationOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Create / Edit organization form
  const [showForm, setShowForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<TeacherOrganizationOut | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<VisibilityType>('public');
  const [accessCode, setAccessCode] = useState('');
  const [saving, setSaving] = useState(false);

  // Join organization (public direct or private via AccessCodeModal)
  const [joiningId, setJoiningId] = useState<EntityId | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<TeacherOrganizationOut | null>(null);

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<TeacherOrganizationOut | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getTeacherOrganizations();
      setOrganizations(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar as organizações.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  const myOrganizations = useMemo(
    () => organizations.filter((org) => org.is_member),
    [organizations]
  );

  const exploreOrganizations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return organizations
      .filter((org) => !org.is_member)
      .filter(
        (org) =>
          !q ||
          org.name.toLowerCase().includes(q) ||
          org.owner_name.toLowerCase().includes(q) ||
          (org.description && org.description.toLowerCase().includes(q))
      );
  }, [organizations, searchQuery]);

  const openCreateForm = () => {
    setEditingOrg(null);
    setName('');
    setDescription('');
    setVisibility('public');
    setAccessCode('');
    setShowForm(true);
  };

  const openEditForm = (org: TeacherOrganizationOut) => {
    setEditingOrg(org);
    setName(org.name);
    setDescription(org.description || '');
    setVisibility(org.visibility);
    setAccessCode(org.access_code || '');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingOrg(null);
    setName('');
    setDescription('');
    setVisibility('public');
    setAccessCode('');
  };

  const handleSaveOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    if (name.trim().length < 2) {
      setError('O nome da organização deve ter pelo menos 2 caracteres.');
      return;
    }

    const trimmedCode = accessCode.trim();
    if (visibility === 'private' && (trimmedCode.length < 4 || trimmedCode.length > 64)) {
      setError('Organizações privadas exigem um código de acesso entre 4 e 64 caracteres.');
      return;
    }

    setSaving(true);
    try {
      if (editingOrg) {
        const updated = await apiClient.updateTeacherOrganization(editingOrg.id, {
          name: name.trim(),
          description: description.trim() || null,
          visibility,
          access_code: visibility === 'private' ? trimmedCode : null,
        });
        setFeedback(`Organização "${updated.name}" atualizada com sucesso.`);
      } else {
        const created = await apiClient.createTeacherOrganization({
          name: name.trim(),
          description: description.trim() || null,
          visibility,
          access_code: visibility === 'private' ? trimmedCode : null,
        });
        setFeedback(`Organização "${created.name}" criada com sucesso.`);
      }
      closeForm();
      await loadOrganizations();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível salvar a organização.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleJoinPublic = async (org: TeacherOrganizationOut) => {
    setJoiningId(org.id);
    setError(null);
    setFeedback(null);
    try {
      await apiClient.joinTeacherOrganization(org.id);
      setFeedback(`Você ingressou na organização "${org.name}" como professor colaborador.`);
      await loadOrganizations();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível ingressar na organização.'
      );
    } finally {
      setJoiningId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    setFeedback(null);
    try {
      await apiClient.deleteTeacherOrganization(deleteTarget.id);
      setFeedback(
        `Organização "${deleteTarget.name}" excluída. Suas turmas foram mantidas como independentes.`
      );
      setDeleteTarget(null);
      await loadOrganizations();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível excluir a organização.'
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#DCE1EB] pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#131B2E]">
              Organizações de Ensino
            </h1>
            <p className="mt-1 text-sm text-[#4B5568]">
              Crie instituições ou departamentos multidisciplinares, configure visibilidade
              pública ou privada e colabore com outros professores.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/teacher/classrooms">
              <Button variant="outline">Ir para Turmas e Simulados</Button>
            </Link>
            <Button
              variant="primary"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={openCreateForm}
            >
              Nova Organização
            </Button>
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

        {/* Create / Edit Form */}
        {showForm && (
          <Card>
            <CardHeader
              title={
                editingOrg
                  ? `Editar Organização: ${editingOrg.name}`
                  : 'Criar Nova Organização'
              }
              description="Organizações agrupam turmas de uma mesma escola, cursinho ou projeto multidisciplinar."
            />

            <form onSubmit={handleSaveOrganization} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="org-name" className="block text-sm font-semibold text-[#131B2E]">
                    Nome da organização
                  </label>
                  <input
                    id="org-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Instituto Horizonte Educacional"
                    className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                </div>

                <div>
                  <label htmlFor="org-desc" className="block text-sm font-semibold text-[#131B2E]">
                    Descrição (opcional)
                  </label>
                  <input
                    id="org-desc"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex.: Rede de ensino médio com simulados integrados"
                    className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-sm font-semibold text-[#131B2E]">Visibilidade</span>
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                  role="radiogroup"
                  aria-label="Visibilidade da organização"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={visibility === 'public'}
                    onClick={() => setVisibility('public')}
                    className={clsx(
                      'min-h-[72px] rounded-lg border p-3.5 text-left transition-colors cursor-pointer',
                      visibility === 'public'
                        ? 'border-[#1B4FD8] bg-[#EEF3FF] ring-1 ring-[#1B4FD8]'
                        : 'border-[#DCE1EB] bg-white hover:border-[#9AA5BC]'
                    )}
                  >
                    <div className="flex items-center gap-2 font-display text-sm font-bold text-[#131B2E]">
                      <Globe
                        className={clsx(
                          'h-4 w-4',
                          visibility === 'public' ? 'text-[#1B4FD8]' : 'text-[#4B5568]'
                        )}
                        aria-hidden="true"
                      />
                      <span>Pública</span>
                    </div>
                    <p className="mt-1 text-xs text-[#4B5568]">
                      Professores e alunos podem visualizar turmas e ingressar diretamente sem
                      código.
                    </p>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={visibility === 'private'}
                    onClick={() => setVisibility('private')}
                    className={clsx(
                      'min-h-[72px] rounded-lg border p-3.5 text-left transition-colors cursor-pointer',
                      visibility === 'private'
                        ? 'border-[#1B4FD8] bg-[#EEF3FF] ring-1 ring-[#1B4FD8]'
                        : 'border-[#DCE1EB] bg-white hover:border-[#9AA5BC]'
                    )}
                  >
                    <div className="flex items-center gap-2 font-display text-sm font-bold text-[#131B2E]">
                      <Lock
                        className={clsx(
                          'h-4 w-4',
                          visibility === 'private' ? 'text-[#92400E]' : 'text-[#4B5568]'
                        )}
                        aria-hidden="true"
                      />
                      <span>Privada</span>
                    </div>
                    <p className="mt-1 text-xs text-[#4B5568]">
                      Exige código de acesso permanente no primeiro ingresso para liberar turmas.
                    </p>
                  </button>
                </div>
              </div>

              {visibility === 'private' && (
                <div className="max-w-md">
                  <label
                    htmlFor="org-access-code"
                    className="block text-sm font-semibold text-[#131B2E]"
                  >
                    Código de acesso da organização
                  </label>
                  <input
                    id="org-access-code"
                    type="text"
                    required
                    minLength={4}
                    maxLength={64}
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    placeholder="Ex.: VERTICE26"
                    className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 font-mono text-base sm:text-sm tracking-wider text-[#131B2E] placeholder:font-sans placeholder:tracking-normal focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                  <p className="mt-1 text-xs text-[#4B5568]">
                    Entre 4 e 64 caracteres. Compartilhe este código com professores e alunos
                    autorizados.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button type="submit" variant="primary" isLoading={saving}>
                  {editingOrg ? 'Salvar Alterações' : 'Criar Organização'}
                </Button>
                <Button type="button" variant="ghost" onClick={closeForm}>
                  Cancelar
                </Button>
              </div>
            </form>
          </Card>
        )}

        {loading ? (
          <LoadingState label="Carregando organizações..." variant="cards" rows={3} />
        ) : (
          <>
            {/* Section 1: My Organizations */}
            <section aria-labelledby="teacher-my-orgs-heading" className="space-y-4">
              <h2
                id="teacher-my-orgs-heading"
                className="font-display text-lg font-bold text-[#131B2E]"
              >
                Minhas Organizações ({myOrganizations.length})
              </h2>

              {myOrganizations.length === 0 ? (
                <EmptyState
                  icon={<Building2 className="h-6 w-6" />}
                  title="Você ainda não participa de nenhuma organização"
                  description="Crie uma organização própria ou ingresse como colaborador em uma organização disponível abaixo."
                  action={
                    <Button
                      variant="primary"
                      leftIcon={<Plus className="h-4 w-4" />}
                      onClick={openCreateForm}
                    >
                      Criar Primeira Organização
                    </Button>
                  }
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myOrganizations.map((org) => (
                    <Card key={String(org.id)} className="flex flex-col justify-between gap-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <VisibilityBadge visibility={org.visibility} entity="feminine" />
                            {org.is_owner ? (
                              <Badge tone="navy">
                                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                                Proprietário
                              </Badge>
                            ) : (
                              <Badge tone="primary">Colaborador</Badge>
                            )}
                          </div>
                        </div>

                        <div>
                          <h3 className="font-display text-lg font-bold text-[#131B2E]">
                            {org.name}
                          </h3>
                          <p className="mt-0.5 text-xs font-medium text-[#4B5568]">
                            Responsável: {org.owner_name}
                          </p>
                          {org.description ? (
                            <p className="mt-2 text-sm text-[#4B5568] leading-relaxed">
                              {org.description}
                            </p>
                          ) : null}
                        </div>

                        {org.is_owner && org.visibility === 'private' && org.access_code ? (
                          <AccessCodeDisplay code={org.access_code} />
                        ) : null}

                        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-[#4B5568] tabular-nums">
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" aria-hidden="true" />
                            {org.teacher_count}{' '}
                            {org.teacher_count === 1 ? 'professor' : 'professores'}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                            {org.classroom_count} {org.classroom_count === 1 ? 'turma' : 'turmas'}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" aria-hidden="true" />
                            {org.student_count} {org.student_count === 1 ? 'aluno' : 'alunos'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#DCE1EB] pt-3.5">
                        <Link to={`/teacher/classrooms?organization=${org.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                          >
                            Ver Turmas
                          </Button>
                        </Link>

                        {org.is_owner && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              leftIcon={<Edit3 className="h-3.5 w-3.5" />}
                              onClick={() => openEditForm(org)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Excluir organização ${org.name}`}
                              onClick={() => setDeleteTarget(org)}
                            >
                              <Trash2 className="h-4 w-4 text-rose-700" aria-hidden="true" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Section 2: Explore Organizations */}
            <section aria-labelledby="teacher-explore-orgs-heading" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2
                  id="teacher-explore-orgs-heading"
                  className="font-display text-lg font-bold text-[#131B2E]"
                >
                  Explorar Organizações ({exploreOrganizations.length})
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
                    placeholder="Buscar organização ou responsável..."
                    aria-label="Buscar organização ou responsável"
                    className="min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white pl-9 pr-3 py-2 text-base sm:text-sm text-[#131B2E] placeholder:text-slate-400 focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                </div>
              </div>

              {exploreOrganizations.length === 0 ? (
                <EmptyState
                  icon={<Building2 className="h-6 w-6" />}
                  title="Nenhuma organização disponível para ingresso"
                  description={
                    searchQuery
                      ? 'Nenhuma organização corresponde à busca digitada.'
                      : 'Você já participa de todas as organizações cadastradas ou ainda não há outras instituições disponíveis.'
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
                  {exploreOrganizations.map((org) => {
                    const isJoining = joiningId === org.id;
                    return (
                      <Card key={String(org.id)} className="flex flex-col justify-between gap-4">
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <VisibilityBadge visibility={org.visibility} entity="feminine" />
                            <span className="font-mono text-xs text-[#4B5568] tabular-nums">
                              {org.classroom_count}{' '}
                              {org.classroom_count === 1 ? 'turma' : 'turmas'}
                            </span>
                          </div>
                          <h3 className="font-display text-base font-bold text-[#131B2E]">
                            {org.name}
                          </h3>
                          <p className="text-xs font-medium text-[#4B5568]">
                            Responsável: {org.owner_name}
                          </p>
                          {org.description ? (
                            <p className="text-sm text-[#4B5568] line-clamp-2">{org.description}</p>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between gap-2 border-t border-[#DCE1EB] pt-3">
                          <span className="text-xs font-medium text-[#4B5568] tabular-nums">
                            {org.teacher_count}{' '}
                            {org.teacher_count === 1 ? 'professor' : 'professores'}
                          </span>
                          {org.visibility === 'private' ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              leftIcon={<Lock className="h-3.5 w-3.5" />}
                              onClick={() => setUnlockTarget(org)}
                            >
                              Ingressar com Código
                            </Button>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              isLoading={isJoining}
                              disabled={joiningId !== null && !isJoining}
                              onClick={() => void handleJoinPublic(org)}
                            >
                              Ingressar
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

      {/* Private Organization Join Modal */}
      <AccessCodeModal
        open={Boolean(unlockTarget)}
        onClose={() => setUnlockTarget(null)}
        entityType="organization"
        entityName={unlockTarget?.name ?? ''}
        subtitle={
          unlockTarget ? `Organização criada por ${unlockTarget.owner_name}` : undefined
        }
        onSubmit={async (code) => {
          if (!unlockTarget) return;
          await apiClient.joinTeacherOrganization(unlockTarget.id, code);
          setFeedback(
            `Você ingressou na organização privada "${unlockTarget.name}" como colaborador.`
          );
          await loadOrganizations();
        }}
      />

      {/* Delete Organization Confirmation Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Confirmar exclusão de organização"
        description="As turmas vinculadas serão preservadas como turmas independentes."
        footer={
          <>
            <Button variant="ghost" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              isLoading={deleting}
              onClick={() => void handleConfirmDelete()}
            >
              Excluir Organização
            </Button>
          </>
        }
      >
        <p className="text-sm text-[#334155]">
          Tem certeza que deseja excluir a organização{' '}
          <strong className="text-[#131B2E]">{deleteTarget?.name}</strong>? As turmas e simulados
          já criados continuarão ativos sem vínculo com a organização.
        </p>
      </Modal>
    </AppShell>
  );
}

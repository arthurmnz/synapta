import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  Building2,
  ClipboardList,
  Edit3,
  Eye,
  EyeOff,
  Globe,
  Layers,
  Lock,
  Plus,
  RefreshCw,
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
import {
  AccessCodeDisplay,
  ListContextBadges,
  VisibilityBadge,
} from '../../components/shared/AccessBadges';
import { AppShell } from '../../components/layout/AppShell';
import { apiClient, ApiError } from '../../lib/apiClient';
import type {
  EntityId,
  ListTypeFilter,
  TeacherClassroomOut,
  TeacherListSummaryOut,
  TeacherOrganizationOut,
  VisibilityType,
} from '../../types/api';

export function TeacherClassroomsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialOrg = searchParams.get('organization') || '';

  const [organizations, setOrganizations] = useState<TeacherOrganizationOut[]>([]);
  const [classrooms, setClassrooms] = useState<TeacherClassroomOut[]>([]);
  const [lists, setLists] = useState<TeacherListSummaryOut[]>([]);

  // Filters
  const [selectedOrgId, setSelectedOrgId] = useState<string>(initialOrg);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
  const [listTypeFilter, setListTypeFilter] = useState<ListTypeFilter>('all');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Create / Edit classroom form
  const [showClassroomForm, setShowClassroomForm] = useState(false);
  const [editingClassroom, setEditingClassroom] = useState<TeacherClassroomOut | null>(null);
  const [classroomName, setClassroomName] = useState('');
  const [classroomDesc, setClassroomDesc] = useState('');
  const [classroomOrgId, setClassroomOrgId] = useState<string>('');
  const [classroomVisibility, setClassroomVisibility] = useState<VisibilityType>('public');
  const [classroomAccessCode, setClassroomAccessCode] = useState('');
  const [savingClassroom, setSavingClassroom] = useState(false);

  // Create list form
  const [showListForm, setShowListForm] = useState(false);
  const [isStandaloneList, setIsStandaloneList] = useState(false);
  const [listClassroomId, setListClassroomId] = useState<string>('');
  const [listTitle, setListTitle] = useState('');
  const [listDesc, setListDesc] = useState('');
  const [listVisibility, setListVisibility] = useState<VisibilityType>('public');
  const [listAccessCode, setListAccessCode] = useState('');
  const [savingList, setSavingList] = useState(false);

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: 'classroom'; id: EntityId; name: string }
    | { type: 'list'; id: EntityId; name: string }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingListId, setTogglingListId] = useState<EntityId | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgs, cls, lst] = await Promise.all([
        apiClient.getTeacherOrganizations(),
        apiClient.getTeacherClassrooms(),
        apiClient.getTeacherLists(),
      ]);
      setOrganizations(orgs);
      setClassrooms(cls);
      setLists(lst);
      if (cls.length > 0) {
        setListClassroomId((prev) => prev || String(cls[0].id));
      }
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
    void loadData();
  }, [loadData]);

  const memberOrganizations = useMemo(
    () => organizations.filter((o) => o.is_member),
    [organizations]
  );

  const handleOrgFilterChange = (value: string) => {
    setSelectedOrgId(value);
    setSelectedClassroomId('');
    if (value) {
      setSearchParams({ organization: value });
    } else {
      setSearchParams({});
    }
  };

  const openCreateClassroom = () => {
    setEditingClassroom(null);
    setClassroomName('');
    setClassroomDesc('');
    setClassroomOrgId(
      selectedOrgId && selectedOrgId !== '__none__' ? selectedOrgId : ''
    );
    setClassroomVisibility('public');
    setClassroomAccessCode('');
    setShowClassroomForm(true);
  };

  const openEditClassroom = (classroom: TeacherClassroomOut) => {
    setEditingClassroom(classroom);
    setClassroomName(classroom.name);
    setClassroomDesc(classroom.description || '');
    setClassroomOrgId(classroom.organization_id ? String(classroom.organization_id) : '');
    setClassroomVisibility(classroom.visibility);
    setClassroomAccessCode(classroom.access_code || '');
    setShowClassroomForm(true);
  };

  const handleSaveClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classroomName.trim()) {
      setError('Informe o nome da turma.');
      return;
    }

    const trimmedCode = classroomAccessCode.trim();
    if (
      classroomVisibility === 'private' &&
      (trimmedCode.length < 4 || trimmedCode.length > 64)
    ) {
      setError('Turmas privadas exigem um código de acesso entre 4 e 64 caracteres.');
      return;
    }

    setSavingClassroom(true);
    setError(null);
    setFeedback(null);
    try {
      const orgIdPayload = classroomOrgId ? classroomOrgId : null;
      if (editingClassroom) {
        await apiClient.updateClassroom(editingClassroom.id, {
          name: classroomName.trim(),
          description: classroomDesc.trim() || null,
          organization_id: orgIdPayload,
          visibility: classroomVisibility,
          access_code: classroomVisibility === 'private' ? trimmedCode : null,
        });
        setFeedback(`Turma "${classroomName.trim()}" atualizada.`);
      } else {
        const created = await apiClient.createClassroom({
          name: classroomName.trim(),
          description: classroomDesc.trim() || null,
          organization_id: orgIdPayload,
          visibility: classroomVisibility,
          access_code: classroomVisibility === 'private' ? trimmedCode : null,
        });
        setFeedback(`Turma "${created.name}" criada com sucesso.`);
        setListClassroomId(String(created.id));
      }
      setShowClassroomForm(false);
      setEditingClassroom(null);
      setClassroomName('');
      setClassroomDesc('');
      setClassroomAccessCode('');
      await loadData();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível salvar a turma.'
      );
    } finally {
      setSavingClassroom(false);
    }
  };

  const openCreateListForm = (forceStandalone = false) => {
    const standalone = forceStandalone || classrooms.length === 0;
    setIsStandaloneList(standalone);
    if (!standalone) {
      if (selectedClassroomId) {
        setListClassroomId(selectedClassroomId);
      } else if (classrooms[0]) {
        setListClassroomId(String(classrooms[0].id));
      }
    }
    setListVisibility('public');
    setListAccessCode('');
    setShowListForm(true);
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    if (!listTitle.trim()) {
      setError('Informe o título do simulado.');
      return;
    }

    if (!isStandaloneList) {
      const chosenClassroom = classrooms.find((c) => String(c.id) === listClassroomId);
      if (!chosenClassroom) {
        setError('Selecione uma turma ou alterne para Simulado Avulso.');
        return;
      }
      const trimmedCode = listAccessCode.trim();
      if (listVisibility === 'private' && (trimmedCode.length < 4 || trimmedCode.length > 64)) {
        setError('Simulados privados exigem um código de acesso entre 4 e 64 caracteres.');
        return;
      }

      setSavingList(true);
      try {
        const created = await apiClient.createList({
          is_standalone: false,
          classroom_id: chosenClassroom.id,
          title: listTitle.trim(),
          description: listDesc.trim() || null,
          visibility: listVisibility,
          access_code: listVisibility === 'private' ? trimmedCode : null,
        });
        navigate(`/teacher/lists/${created.id}`);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Não foi possível criar o simulado.'
        );
        setSavingList(false);
      }
      return;
    }

    setSavingList(true);
    try {
      const created = await apiClient.createList({
        is_standalone: true,
        title: listTitle.trim(),
        description: listDesc.trim() || null,
        visibility: 'public',
      });
      navigate(`/teacher/lists/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível criar o simulado avulso.'
      );
      setSavingList(false);
    }
  };

  const handleTogglePublish = async (list: TeacherListSummaryOut) => {
    setTogglingListId(list.id);
    setError(null);
    setFeedback(null);
    try {
      const updated = await apiClient.updateList(list.id, {
        is_published: !list.is_published,
      });
      setLists((prev) =>
        prev.map((item) =>
          item.id === list.id ? { ...item, is_published: updated.is_published } : item
        )
      );
      setFeedback(
        updated.is_published
          ? `Simulado "${list.title}" publicado para os alunos.`
          : `Simulado "${list.title}" movido para rascunho.`
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível alterar o status de publicação do simulado.'
      );
    } finally {
      setTogglingListId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    setFeedback(null);
    try {
      if (deleteTarget.type === 'classroom') {
        await apiClient.deleteClassroom(deleteTarget.id);
        if (selectedClassroomId === String(deleteTarget.id)) {
          setSelectedClassroomId('');
        }
        setFeedback(`Turma "${deleteTarget.name}" removida.`);
      } else {
        await apiClient.deleteList(deleteTarget.id);
        setFeedback(`Simulado "${deleteTarget.name}" removido.`);
      }
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível concluir a exclusão.'
      );
    } finally {
      setDeleting(false);
    }
  };

  const filteredClassrooms = useMemo(() => {
    if (!selectedOrgId) return classrooms;
    if (selectedOrgId === '__none__') {
      return classrooms.filter((c) => !c.organization_id);
    }
    return classrooms.filter((c) => String(c.organization_id) === selectedOrgId);
  }, [classrooms, selectedOrgId]);

  const filteredLists = useMemo(() => {
    return lists.filter((l) => {
      if (listTypeFilter === 'classroom' && l.is_standalone) return false;
      if (listTypeFilter === 'standalone' && !l.is_standalone) return false;

      if (selectedClassroomId) {
        return !l.is_standalone && String(l.classroom_id) === selectedClassroomId;
      }

      if (selectedOrgId === '__none__') {
        return !l.is_standalone && !l.organization_id;
      }
      if (selectedOrgId) {
        return !l.is_standalone && String(l.organization_id) === selectedOrgId;
      }

      return true;
    });
  }, [lists, listTypeFilter, selectedClassroomId, selectedOrgId]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#DCE1EB] pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#131B2E]">
              Turmas e Simulados
            </h1>
            <p className="mt-1 text-sm text-[#4B5568]">
              Organize turmas vinculadas ou independentes e publique simulados de turma ou
              avulsos de qualquer disciplina.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/teacher/organizations">
              <Button variant="outline" leftIcon={<Building2 className="h-4 w-4" />}>
                Organizações
              </Button>
            </Link>
            <Button
              variant="outline"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={openCreateClassroom}
            >
              Nova Turma
            </Button>
            <Button
              variant="primary"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => openCreateListForm(false)}
            >
              Novo Simulado
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
                onClick={() => void loadData()}
              >
                Atualizar
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {feedback && <Alert tone="success">{feedback}</Alert>}

        {/* Inline Classroom Form */}
        {showClassroomForm && (
          <Card>
            <CardHeader
              title={
                editingClassroom ? `Editar Turma: ${editingClassroom.name}` : 'Criar Nova Turma'
              }
              description="Vincule opcionalmente a uma organização e defina se o acesso dos alunos é público ou protegido por código."
            />
            <form onSubmit={handleSaveClassroom} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="classroom-name"
                    className="block text-sm font-semibold text-[#131B2E]"
                  >
                    Nome da turma
                  </label>
                  <input
                    id="classroom-name"
                    type="text"
                    required
                    value={classroomName}
                    onChange={(e) => setClassroomName(e.target.value)}
                    placeholder="Ex.: Biologia & Física — 2º Ano"
                    className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="classroom-org"
                    className="block text-sm font-semibold text-[#131B2E]"
                  >
                    Organização (opcional)
                  </label>
                  <select
                    id="classroom-org"
                    value={classroomOrgId}
                    onChange={(e) => setClassroomOrgId(e.target.value)}
                    className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  >
                    <option value="">Sem organização (Turma independente)</option>
                    {memberOrganizations.map((org) => (
                      <option key={String(org.id)} value={String(org.id)}>
                        {org.name} ({org.visibility === 'private' ? 'Privada' : 'Pública'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="classroom-desc"
                    className="block text-sm font-semibold text-[#131B2E]"
                  >
                    Descrição (opcional)
                  </label>
                  <input
                    id="classroom-desc"
                    type="text"
                    value={classroomDesc}
                    onChange={(e) => setClassroomDesc(e.target.value)}
                    placeholder="Ex.: Simulados semanais multidisciplinares"
                    className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div>
                  <span className="block text-sm font-semibold text-[#131B2E] mb-1.5">
                    Visibilidade da turma
                  </span>
                  <div
                    className="grid grid-cols-2 gap-2.5"
                    role="radiogroup"
                    aria-label="Visibilidade da turma"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={classroomVisibility === 'public'}
                      onClick={() => setClassroomVisibility('public')}
                      className={clsx(
                        'min-h-[44px] flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors cursor-pointer',
                        classroomVisibility === 'public'
                          ? 'border-[#1B4FD8] bg-[#EEF3FF] text-[#1640B0] ring-1 ring-[#1B4FD8]'
                          : 'border-[#DCE1EB] bg-white text-[#4B5568] hover:border-[#9AA5BC]'
                      )}
                    >
                      <Globe className="h-4 w-4" aria-hidden="true" />
                      Pública
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={classroomVisibility === 'private'}
                      onClick={() => setClassroomVisibility('private')}
                      className={clsx(
                        'min-h-[44px] flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors cursor-pointer',
                        classroomVisibility === 'private'
                          ? 'border-[#1B4FD8] bg-[#EEF3FF] text-[#1640B0] ring-1 ring-[#1B4FD8]'
                          : 'border-[#DCE1EB] bg-white text-[#4B5568] hover:border-[#9AA5BC]'
                      )}
                    >
                      <Lock className="h-4 w-4" aria-hidden="true" />
                      Privada
                    </button>
                  </div>
                </div>

                {classroomVisibility === 'private' && (
                  <div>
                    <label
                      htmlFor="classroom-access-code"
                      className="block text-sm font-semibold text-[#131B2E]"
                    >
                      Código de acesso da turma
                    </label>
                    <input
                      id="classroom-access-code"
                      type="text"
                      required
                      minLength={4}
                      maxLength={64}
                      value={classroomAccessCode}
                      onChange={(e) => setClassroomAccessCode(e.target.value)}
                      placeholder="Ex.: BIOFIS26"
                      className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 font-mono text-base sm:text-sm tracking-wider text-[#131B2E] placeholder:font-sans placeholder:tracking-normal focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="primary" isLoading={savingClassroom}>
                  {editingClassroom ? 'Salvar Alterações' : 'Criar Turma'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowClassroomForm(false);
                    setEditingClassroom(null);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Inline List Creation Form */}
        {showListForm && (
          <Card>
            <CardHeader
              title="Criar Novo Simulado"
              description="Escolha entre um simulado vinculado a uma turma ou um Simulado Avulso público para todos os alunos."
            />
            <form onSubmit={handleCreateList} className="mt-4 space-y-4">
              {/* Classification Toggle */}
              <div>
                <span className="block text-sm font-semibold text-[#131B2E] mb-2">
                  Classificação do simulado
                </span>
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                  role="radiogroup"
                  aria-label="Classificação do simulado"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!isStandaloneList}
                    onClick={() => setIsStandaloneList(false)}
                    className={clsx(
                      'min-h-[68px] rounded-lg border p-3.5 text-left transition-colors cursor-pointer',
                      !isStandaloneList
                        ? 'border-[#1B4FD8] bg-[#EEF3FF] ring-1 ring-[#1B4FD8]'
                        : 'border-[#DCE1EB] bg-white hover:border-[#9AA5BC]'
                    )}
                  >
                    <div className="flex items-center gap-2 font-display text-sm font-bold text-[#131B2E]">
                      <BookOpen className="h-4 w-4 text-[#1B4FD8]" aria-hidden="true" />
                      <span>Simulado de Turma</span>
                    </div>
                    <p className="mt-1 text-xs text-[#4B5568]">
                      Vinculado a uma turma específica; pode ser público ou privado com código.
                    </p>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={isStandaloneList}
                    onClick={() => setIsStandaloneList(true)}
                    className={clsx(
                      'min-h-[68px] rounded-lg border p-3.5 text-left transition-colors cursor-pointer',
                      isStandaloneList
                        ? 'border-[#1B4FD8] bg-[#EEF3FF] ring-1 ring-[#1B4FD8]'
                        : 'border-[#DCE1EB] bg-white hover:border-[#9AA5BC]'
                    )}
                  >
                    <div className="flex items-center gap-2 font-display text-sm font-bold text-[#131B2E]">
                      <Layers className="h-4 w-4 text-[#1B4FD8]" aria-hidden="true" />
                      <span>Simulado Avulso (Público)</span>
                    </div>
                    <p className="mt-1 text-xs text-[#4B5568]">
                      Sem turma nem organização; sempre público para qualquer aluno da plataforma.
                    </p>
                  </button>
                </div>
              </div>

              {!isStandaloneList && classrooms.length === 0 ? (
                <Alert
                  tone="warning"
                  action={
                    <Button variant="outline" size="sm" onClick={openCreateClassroom}>
                      Criar Turma
                    </Button>
                  }
                >
                  Você ainda não possui turmas criadas. Crie uma turma primeiro ou alterne para{' '}
                  <strong>Simulado Avulso</strong>.
                </Alert>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {!isStandaloneList && (
                  <div>
                    <label
                      htmlFor="new-list-classroom"
                      className="block text-sm font-semibold text-[#131B2E]"
                    >
                      Turma de destino
                    </label>
                    <select
                      id="new-list-classroom"
                      value={listClassroomId}
                      onChange={(e) => setListClassroomId(e.target.value)}
                      className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                    >
                      {classrooms.map((c) => (
                        <option key={String(c.id)} value={String(c.id)}>
                          {c.name}
                          {c.organization_name ? ` (${c.organization_name})` : ' (Independente)'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={isStandaloneList ? 'sm:col-span-2' : ''}>
                  <label
                    htmlFor="new-list-title"
                    className="block text-sm font-semibold text-[#131B2E]"
                  >
                    Título do simulado
                  </label>
                  <input
                    id="new-list-title"
                    type="text"
                    required
                    value={listTitle}
                    onChange={(e) => setListTitle(e.target.value)}
                    placeholder="Ex.: Simulado Diagnóstico — Biologia, História e Álgebra"
                    className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                </div>
              </div>

              {!isStandaloneList && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <div>
                    <span className="block text-sm font-semibold text-[#131B2E] mb-1.5">
                      Visibilidade do simulado
                    </span>
                    <div
                      className="grid grid-cols-2 gap-2.5"
                      role="radiogroup"
                      aria-label="Visibilidade do simulado"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={listVisibility === 'public'}
                        onClick={() => setListVisibility('public')}
                        className={clsx(
                          'min-h-[44px] flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors cursor-pointer',
                          listVisibility === 'public'
                            ? 'border-[#1B4FD8] bg-[#EEF3FF] text-[#1640B0] ring-1 ring-[#1B4FD8]'
                            : 'border-[#DCE1EB] bg-white text-[#4B5568] hover:border-[#9AA5BC]'
                        )}
                      >
                        <Globe className="h-4 w-4" aria-hidden="true" />
                        Público na turma
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={listVisibility === 'private'}
                        onClick={() => setListVisibility('private')}
                        className={clsx(
                          'min-h-[44px] flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors cursor-pointer',
                          listVisibility === 'private'
                            ? 'border-[#1B4FD8] bg-[#EEF3FF] text-[#1640B0] ring-1 ring-[#1B4FD8]'
                            : 'border-[#DCE1EB] bg-white text-[#4B5568] hover:border-[#9AA5BC]'
                        )}
                      >
                        <Lock className="h-4 w-4" aria-hidden="true" />
                        Privado com código
                      </button>
                    </div>
                  </div>

                  {listVisibility === 'private' && (
                    <div>
                      <label
                        htmlFor="new-list-access-code"
                        className="block text-sm font-semibold text-[#131B2E]"
                      >
                        Código de acesso do simulado
                      </label>
                      <input
                        id="new-list-access-code"
                        type="text"
                        required
                        minLength={4}
                        maxLength={64}
                        value={listAccessCode}
                        onChange={(e) => setListAccessCode(e.target.value)}
                        placeholder="Ex.: DESAFIO26"
                        className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 font-mono text-base sm:text-sm tracking-wider text-[#131B2E] placeholder:font-sans placeholder:tracking-normal focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label
                  htmlFor="new-list-desc"
                  className="block text-sm font-semibold text-[#131B2E]"
                >
                  Orientações para os alunos (opcional)
                </label>
                <input
                  id="new-list-desc"
                  type="text"
                  value={listDesc}
                  onChange={(e) => setListDesc(e.target.value)}
                  placeholder="Ex.: Leia atentamente cada enunciado antes de marcar a alternativa."
                  className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={savingList}
                  disabled={!isStandaloneList && classrooms.length === 0}
                >
                  Criar e Adicionar Questões
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowListForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Filter Bar */}
        {!loading && (
          <Card padding="sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <span className="block text-xs font-bold text-[#131B2E] mb-1.5">
                  Tipo de simulado
                </span>
                <div
                  role="group"
                  aria-label="Filtrar por tipo de simulado"
                  className="grid grid-cols-3 rounded-lg border border-[#CBD3E1] bg-[#EEF1F7] p-1"
                >
                  {(
                    [
                      { value: 'all', label: 'Todos' },
                      { value: 'classroom', label: 'De Turma' },
                      { value: 'standalone', label: 'Avulsos' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setListTypeFilter(opt.value);
                        if (opt.value === 'standalone') {
                          setSelectedClassroomId('');
                        }
                      }}
                      className={clsx(
                        'min-h-[44px] sm:min-h-[36px] rounded-md px-2 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                        listTypeFilter === opt.value
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
                <label
                  htmlFor="teacher-org-filter"
                  className="block text-xs font-bold text-[#131B2E] mb-1.5"
                >
                  Filtrar por organização
                </label>
                <select
                  id="teacher-org-filter"
                  value={selectedOrgId}
                  onChange={(e) => handleOrgFilterChange(e.target.value)}
                  className="block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                >
                  <option value="">Todas as organizações</option>
                  <option value="__none__">Sem organização (Turmas independentes)</option>
                  {memberOrganizations.map((org) => (
                    <option key={String(org.id)} value={String(org.id)}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="teacher-classroom-filter"
                  className="block text-xs font-bold text-[#131B2E] mb-1.5"
                >
                  Filtrar por turma
                </label>
                <select
                  id="teacher-classroom-filter"
                  value={selectedClassroomId}
                  disabled={listTypeFilter === 'standalone'}
                  onChange={(e) => setSelectedClassroomId(e.target.value)}
                  className="block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E] disabled:bg-[#F8F8F5] disabled:text-[#4B5568] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                >
                  <option value="">Todas as turmas ({filteredClassrooms.length})</option>
                  {filteredClassrooms.map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>
        )}

        {loading ? (
          <LoadingState label="Carregando turmas e simulados..." variant="cards" rows={3} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Classrooms Column */}
            <section aria-labelledby="teacher-classrooms-heading" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2
                  id="teacher-classrooms-heading"
                  className="font-display text-base font-bold text-[#131B2E]"
                >
                  Minhas Turmas ({filteredClassrooms.length})
                </h2>
                {selectedClassroomId && (
                  <button
                    type="button"
                    onClick={() => setSelectedClassroomId('')}
                    className="min-h-[44px] px-2 text-xs font-semibold text-[#1B4FD8] hover:underline cursor-pointer"
                  >
                    Mostrar todas
                  </button>
                )}
              </div>

              {filteredClassrooms.length === 0 ? (
                <EmptyState
                  icon={<BookOpen className="h-6 w-6" />}
                  title="Nenhuma turma encontrada"
                  description={
                    selectedOrgId
                      ? 'Nenhuma turma vinculada ao filtro selecionado.'
                      : 'Crie uma turma ou publique Simulados Avulsos abertos.'
                  }
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Plus className="h-4 w-4" />}
                      onClick={openCreateClassroom}
                    >
                      Criar Turma
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-2.5">
                  {filteredClassrooms.map((classroom) => {
                    const isSelected = selectedClassroomId === String(classroom.id);
                    return (
                      <div
                        key={String(classroom.id)}
                        className={clsx(
                          'rounded-[10px] border bg-white p-4 shadow-card transition-colors space-y-2.5',
                          isSelected
                            ? 'border-[#1B4FD8] ring-1 ring-[#1B4FD8]'
                            : 'border-[#DCE1EB] hover:border-[#9AA5BC]'
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <VisibilityBadge visibility={classroom.visibility} entity="feminine" />
                          {classroom.organization_name ? (
                            <Badge tone="neutral">
                              <Building2 className="h-3 w-3" aria-hidden="true" />
                              {classroom.organization_name}
                            </Badge>
                          ) : (
                            <Badge tone="neutral">Sem organização</Badge>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (listTypeFilter === 'standalone') {
                              setListTypeFilter('all');
                            }
                            setSelectedClassroomId(isSelected ? '' : String(classroom.id));
                          }}
                          className="w-full text-left cursor-pointer"
                        >
                          <p className="font-display font-bold text-[#131B2E] truncate">
                            {classroom.name}
                          </p>
                          {classroom.description ? (
                            <p className="mt-1 text-xs text-[#4B5568] line-clamp-2">
                              {classroom.description}
                            </p>
                          ) : null}
                        </button>

                        {classroom.visibility === 'private' && classroom.access_code ? (
                          <div>
                            <AccessCodeDisplay code={classroom.access_code} label="Código" />
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#DCE1EB] pt-2.5">
                          <div className="flex items-center gap-3 font-mono text-xs font-semibold text-[#4B5568] tabular-nums">
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" aria-hidden="true" />
                              {classroom.student_count}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                              {classroom.list_count}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditClassroom(classroom)}
                              aria-label={`Editar turma ${classroom.name}`}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#4B5568] hover:bg-[#EEF1F7] hover:text-[#131B2E] transition-colors cursor-pointer"
                            >
                              <Edit3 className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  type: 'classroom',
                                  id: classroom.id,
                                  name: classroom.name,
                                })
                              }
                              aria-label={`Excluir turma ${classroom.name}`}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#4B5568] hover:bg-[#FFF1F2] hover:text-[#BE123C] transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Question Lists Column */}
            <section aria-labelledby="teacher-lists-heading" className="lg:col-span-2 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="teacher-lists-heading" className="font-display text-base font-bold text-[#131B2E]">
                  Simulados e Listas ({filteredLists.length})
                </h2>
                {selectedClassroomId && (
                  <span className="text-xs font-medium text-[#4B5568]">
                    Filtrando por:{' '}
                    <strong className="text-[#131B2E]">
                      {classrooms.find((c) => String(c.id) === selectedClassroomId)?.name}
                    </strong>
                  </span>
                )}
              </div>

              {filteredLists.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList className="h-6 w-6" />}
                  title="Nenhum simulado encontrado nesta seleção"
                  description="Crie um novo simulado vinculado a uma turma ou um Simulado Avulso aberto para todos os alunos."
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        variant="primary"
                        leftIcon={<Plus className="h-4 w-4" />}
                        onClick={() => openCreateListForm(listTypeFilter === 'standalone')}
                      >
                        Criar Simulado
                      </Button>
                      {(selectedClassroomId || selectedOrgId || listTypeFilter !== 'all') && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setListTypeFilter('all');
                            setSelectedClassroomId('');
                            handleOrgFilterChange('');
                          }}
                        >
                          Limpar filtros
                        </Button>
                      )}
                    </div>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {filteredLists.map((list) => {
                    const isToggling = togglingListId === list.id;
                    return (
                      <Card key={String(list.id)} padding="md">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <ListContextBadges
                                isStandalone={list.is_standalone}
                                classroomName={list.classroom_name}
                                organizationName={list.organization_name}
                              />
                              <VisibilityBadge visibility={list.visibility} entity="masculine" />
                              {list.is_published ? (
                                <Badge tone="success">Publicada</Badge>
                              ) : (
                                <Badge tone="warning">Rascunho</Badge>
                              )}
                            </div>

                            <h3 className="font-display text-base font-bold text-[#131B2E]">
                              {list.title}
                            </h3>
                            {list.description ? (
                              <p className="text-sm text-[#4B5568] line-clamp-2">
                                {list.description}
                              </p>
                            ) : null}

                            {!list.is_standalone &&
                            list.visibility === 'private' &&
                            list.access_code ? (
                              <div>
                                <AccessCodeDisplay code={list.access_code} />
                              </div>
                            ) : null}

                            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs font-semibold text-[#4B5568] tabular-nums">
                              <span>
                                {list.question_count}{' '}
                                {list.question_count === 1 ? 'questão' : 'questões'}
                              </span>
                              <span>
                                {list.submission_count}{' '}
                                {list.submission_count === 1 ? 'entrega' : 'entregas'}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              isLoading={isToggling}
                              leftIcon={
                                list.is_published ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )
                              }
                              onClick={() => void handleTogglePublish(list)}
                            >
                              {list.is_published ? 'Despublicar' : 'Publicar'}
                            </Button>

                            <Link to={`/teacher/lists/${list.id}`}>
                              <Button
                                variant="primary"
                                size="sm"
                                leftIcon={<Edit3 className="h-3.5 w-3.5" />}
                              >
                                Editar Questões
                              </Button>
                            </Link>

                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Excluir simulado ${list.title}`}
                              onClick={() =>
                                setDeleteTarget({
                                  type: 'list',
                                  id: list.id,
                                  name: list.title,
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4 text-rose-700" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        title={
          deleteTarget?.type === 'classroom'
            ? 'Confirmar exclusão de turma'
            : 'Confirmar exclusão de simulado'
        }
        description="Esta ação é permanente e removerá os dados vinculados."
        footer={
          <>
            <Button variant="ghost" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="danger" isLoading={deleting} onClick={() => void handleConfirmDelete()}>
              Excluir definitivamente
            </Button>
          </>
        }
      >
        <p className="text-sm text-[#334155]">
          Tem certeza que deseja excluir{' '}
          <strong className="text-[#131B2E]">{deleteTarget?.name}</strong>?
        </p>
      </Modal>
    </AppShell>
  );
}

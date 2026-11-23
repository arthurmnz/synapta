import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ClipboardList,
  Edit3,
  Eye,
  EyeOff,
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
import { AppShell } from '../../components/layout/AppShell';
import { apiClient, ApiError } from '../../lib/apiClient';
import type {
  EntityId,
  TeacherClassroomOut,
  TeacherListSummaryOut,
} from '../../types/api';

export function TeacherClassroomsPage() {
  const navigate = useNavigate();

  const [classrooms, setClassrooms] = useState<TeacherClassroomOut[]>([]);
  const [lists, setLists] = useState<TeacherListSummaryOut[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Create / Edit classroom form
  const [showClassroomForm, setShowClassroomForm] = useState(false);
  const [editingClassroom, setEditingClassroom] = useState<TeacherClassroomOut | null>(null);
  const [classroomName, setClassroomName] = useState('');
  const [classroomDesc, setClassroomDesc] = useState('');
  const [savingClassroom, setSavingClassroom] = useState(false);

  // Create list form
  const [showListForm, setShowListForm] = useState(false);
  const [listClassroomId, setListClassroomId] = useState<string>('');
  const [listTitle, setListTitle] = useState('');
  const [listDesc, setListDesc] = useState('');
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
      const [cls, lst] = await Promise.all([
        apiClient.getTeacherClassrooms(),
        apiClient.getTeacherLists(),
      ]);
      setClassrooms(cls);
      setLists(lst);
      if (cls.length > 0) {
        setListClassroomId((prev) => prev || String(cls[0].id));
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar suas turmas e listas.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreateClassroom = () => {
    setEditingClassroom(null);
    setClassroomName('');
    setClassroomDesc('');
    setShowClassroomForm(true);
  };

  const openEditClassroom = (classroom: TeacherClassroomOut) => {
    setEditingClassroom(classroom);
    setClassroomName(classroom.name);
    setClassroomDesc(classroom.description || '');
    setShowClassroomForm(true);
  };

  const handleSaveClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classroomName.trim()) {
      setError('Informe o nome da turma.');
      return;
    }

    setSavingClassroom(true);
    setError(null);
    setFeedback(null);
    try {
      if (editingClassroom) {
        await apiClient.updateClassroom(editingClassroom.id, {
          name: classroomName.trim(),
          description: classroomDesc.trim() || null,
        });
        setFeedback(`Turma "${classroomName.trim()}" atualizada.`);
      } else {
        const created = await apiClient.createClassroom({
          name: classroomName.trim(),
          description: classroomDesc.trim() || null,
        });
        setFeedback(`Turma "${created.name}" criada com sucesso.`);
        setListClassroomId(String(created.id));
      }
      setShowClassroomForm(false);
      setEditingClassroom(null);
      setClassroomName('');
      setClassroomDesc('');
      await loadData();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível salvar a turma.'
      );
    } finally {
      setSavingClassroom(false);
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenClassroom = classrooms.find((c) => String(c.id) === listClassroomId);
    if (!chosenClassroom) {
      setError('Selecione uma turma para vincular a nova lista.');
      return;
    }
    if (!listTitle.trim()) {
      setError('Informe o título da lista de exercícios.');
      return;
    }

    setSavingList(true);
    setError(null);
    setFeedback(null);
    try {
      const created = await apiClient.createList({
        classroom_id: chosenClassroom.id,
        title: listTitle.trim(),
        description: listDesc.trim() || null,
      });
      navigate(`/teacher/lists/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível criar a lista.'
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
          ? `Lista "${list.title}" publicada para os alunos.`
          : `Lista "${list.title}" movida para rascunho.`
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível alterar o status de publicação da lista.'
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
        setFeedback(`Lista "${deleteTarget.name}" removida.`);
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

  const filteredLists = useMemo(() => {
    if (!selectedClassroomId) return lists;
    return lists.filter((l) => String(l.classroom_id) === selectedClassroomId);
  }, [lists, selectedClassroomId]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#DCE1EB] pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#131B2E]">
              Turmas e Listas de Exercícios
            </h1>
            <p className="mt-1 text-sm text-[#4B5568]">
              Organize suas turmas de Matemática e gerencie as listas publicadas para seus alunos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={openCreateClassroom}
            >
              Nova Turma
            </Button>
            <Button
              variant="primary"
              disabled={classrooms.length === 0}
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => {
                if (selectedClassroomId) {
                  setListClassroomId(selectedClassroomId);
                } else if (classrooms[0]) {
                  setListClassroomId(String(classrooms[0].id));
                }
                setShowListForm((prev) => !prev);
              }}
            >
              Nova Lista
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
              title={editingClassroom ? `Editar Turma: ${editingClassroom.name}` : 'Criar Nova Turma'}
              description="Os alunos poderão visualizar e escolher esta turma no catálogo."
            />
            <form onSubmit={handleSaveClassroom} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    placeholder="Ex.: 9º Ano A — Álgebra"
                    className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
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
                    placeholder="Ex.: Foco em equações, funções e geometria plana"
                    className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                </div>
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
        {showListForm && classrooms.length > 0 && (
          <Card>
            <CardHeader
              title="Criar Nova Lista de Questões"
              description="Após criar a lista, você será direcionado ao editor para incluir as questões A–D."
            />
            <form onSubmit={handleCreateList} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      </option>
                    ))}
                  </select>
                </div>

                <div>
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
                    placeholder="Ex.: Simulado 01 — Equações e Frações"
                    className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                </div>
              </div>

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
                <Button type="submit" variant="primary" isLoading={savingList}>
                  Criar e Adicionar Questões
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowListForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </Card>
        )}

        {loading ? (
          <LoadingState label="Carregando turmas e listas..." variant="cards" rows={3} />
        ) : classrooms.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="Você ainda não criou nenhuma turma"
            description="Crie sua primeira turma de Matemática para matricular alunos e disponibilizar simulados."
            action={
              <Button
                variant="primary"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={openCreateClassroom}
              >
                Criar Primeira Turma
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Classrooms Column */}
            <section aria-labelledby="teacher-classrooms-heading" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2
                  id="teacher-classrooms-heading"
                  className="font-display text-base font-bold text-[#131B2E]"
                >
                  Minhas Turmas ({classrooms.length})
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

              <div className="space-y-2.5">
                {classrooms.map((classroom) => {
                  const isSelected = selectedClassroomId === String(classroom.id);
                  return (
                    <div
                      key={String(classroom.id)}
                      className={clsx(
                        'rounded-[10px] border bg-white p-4 shadow-card transition-colors',
                        isSelected
                          ? 'border-[#1B4FD8] ring-1 ring-[#1B4FD8]'
                          : 'border-[#DCE1EB] hover:border-[#9AA5BC]'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedClassroomId(isSelected ? '' : String(classroom.id))
                          }
                          className="min-h-[44px] text-left min-w-0 flex-1 cursor-pointer"
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
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#DCE1EB] pt-2.5">
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
            </section>

            {/* Question Lists Column */}
            <section aria-labelledby="teacher-lists-heading" className="lg:col-span-2 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="teacher-lists-heading" className="text-base font-bold text-slate-900">
                  Listas e Simulados ({filteredLists.length})
                </h2>
                {selectedClassroomId && (
                  <span className="text-xs font-medium text-slate-600">
                    Filtrando por:{' '}
                    <strong>
                      {classrooms.find((c) => String(c.id) === selectedClassroomId)?.name}
                    </strong>
                  </span>
                )}
              </div>

              {filteredLists.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList className="h-6 w-6" />}
                  title="Nenhuma lista criada nesta seleção"
                  description="Crie uma lista de questões de múltipla escolha para disponibilizar aos alunos desta turma."
                  action={
                    <Button
                      variant="primary"
                      leftIcon={<Plus className="h-4 w-4" />}
                      onClick={() => {
                        if (selectedClassroomId) setListClassroomId(selectedClassroomId);
                        setShowListForm(true);
                      }}
                    >
                      Criar Lista
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {filteredLists.map((list) => {
                    const isToggling = togglingListId === list.id;
                    return (
                      <Card key={String(list.id)} padding="md">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone="navy">{list.classroom_name}</Badge>
                              {list.is_published ? (
                                <Badge tone="success">Publicada</Badge>
                              ) : (
                                <Badge tone="warning">Rascunho</Badge>
                              )}
                            </div>

                            <h3 className="text-base font-bold text-slate-900">{list.title}</h3>
                            {list.description ? (
                              <p className="text-sm text-slate-600 line-clamp-2">
                                {list.description}
                              </p>
                            ) : null}

                            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs font-semibold text-slate-600 tabular-nums">
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
                              aria-label={`Excluir lista ${list.title}`}
                              onClick={() =>
                                setDeleteTarget({
                                  type: 'list',
                                  id: list.id,
                                  name: list.title,
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4 text-rose-700" />
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
            : 'Confirmar exclusão de lista'
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
        <p className="text-sm text-slate-700">
          Tem certeza que deseja excluir{' '}
          <strong className="text-slate-900">{deleteTarget?.name}</strong>?
        </p>
      </Modal>
    </AppShell>
  );
}

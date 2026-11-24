import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Globe,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Trash2,
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
import {
  AccessCodeDisplay,
  ListContextBadges,
  VisibilityBadge,
} from '../../components/shared/AccessBadges';
import { AppShell } from '../../components/layout/AppShell';
import { apiClient, ApiError } from '../../lib/apiClient';
import type {
  EntityId,
  OptionKey,
  QuestionOptions,
  TeacherClassroomOut,
  TeacherListDetailOut,
  TeacherListUpdatePayload,
  TeacherQuestionOut,
  TopicOut,
  VisibilityType,
} from '../../types/api';

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];
const EMPTY_OPTIONS: QuestionOptions = { A: '', B: '', C: '', D: '' };

export function TeacherListEditorPage() {
  const { listId } = useParams<{ listId: string }>();

  const [detail, setDetail] = useState<TeacherListDetailOut | null>(null);
  const [topics, setTopics] = useState<TopicOut[]>([]);
  const [classrooms, setClassrooms] = useState<TeacherClassroomOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // List metadata & hierarchy form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isStandalone, setIsStandalone] = useState(false);
  const [classroomId, setClassroomId] = useState('');
  const [visibility, setVisibility] = useState<VisibilityType>('public');
  const [accessCode, setAccessCode] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [togglingPublish, setTogglingPublish] = useState(false);

  // New topic inline creator
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicDesc, setNewTopicDesc] = useState('');
  const [savingTopic, setSavingTopic] = useState(false);

  // Question form (create or edit)
  const [editingQuestionId, setEditingQuestionId] = useState<EntityId | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [statement, setStatement] = useState('');
  const [options, setOptions] = useState<QuestionOptions>(EMPTY_OPTIONS);
  const [correctOption, setCorrectOption] = useState<OptionKey>('A');
  const [explanation, setExplanation] = useState('');
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [deletingQuestionId, setDeletingQuestionId] = useState<EntityId | null>(null);

  const syncFormWithDetail = (listData: TeacherListDetailOut, clsList: TeacherClassroomOut[]) => {
    setTitle(listData.title);
    setDescription(listData.description || '');
    setIsStandalone(Boolean(listData.is_standalone));
    setClassroomId(
      listData.classroom_id
        ? String(listData.classroom_id)
        : clsList[0]
          ? String(clsList[0].id)
          : ''
    );
    setVisibility(listData.visibility ?? 'public');
    setAccessCode(listData.access_code || '');
  };

  const loadListAndTopics = useCallback(async () => {
    if (!listId) return;
    setLoading(true);
    setError(null);
    try {
      const [listData, topicList, teacherClassrooms] = await Promise.all([
        apiClient.getTeacherListDetail(listId),
        apiClient.getTopics(),
        apiClient.getTeacherClassrooms().catch(() => [] as TeacherClassroomOut[]),
      ]);
      setDetail(listData);
      setTopics(topicList);
      setClassrooms(teacherClassrooms);
      syncFormWithDetail(listData, teacherClassrooms);
      if (topicList.length > 0) {
        setSelectedTopicId((prev) => prev || String(topicList[0].id));
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar os detalhes deste simulado.'
      );
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    void loadListAndTopics();
  }, [loadListAndTopics]);

  const sortedQuestions = useMemo(() => {
    if (!detail) return [];
    return [...detail.questions].sort((a, b) => a.order_index - b.order_index);
  }, [detail]);

  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listId || !detail) return;
    setError(null);
    setFeedback(null);

    if (!title.trim()) {
      setError('O título do simulado não pode ficar em branco.');
      return;
    }

    if (!isStandalone) {
      if (!detail.has_submissions && !classroomId) {
        setError('Selecione uma turma para o simulado ou marque como Simulado Avulso.');
        return;
      }
      const trimmedCode = accessCode.trim();
      if (visibility === 'private' && (trimmedCode.length < 4 || trimmedCode.length > 64)) {
        setError('Simulados privados exigem um código de acesso entre 4 e 64 caracteres.');
        return;
      }
    }

    setSavingMeta(true);
    try {
      const payload: TeacherListUpdatePayload = {
        title: title.trim(),
        description: description.trim() || null,
      };

      if (!detail.has_submissions) {
        payload.is_standalone = isStandalone;
        if (!isStandalone) {
          const matchedClassroom = classrooms.find((c) => String(c.id) === classroomId);
          payload.classroom_id = matchedClassroom ? matchedClassroom.id : classroomId;
        }
      }

      if (isStandalone) {
        payload.visibility = 'public';
        payload.access_code = null;
      } else {
        payload.visibility = visibility;
        payload.access_code = visibility === 'private' ? accessCode.trim() : null;
      }

      const updated = await apiClient.updateList(listId, payload);
      setDetail(updated);
      syncFormWithDetail(updated, classrooms);
      setFeedback('Configurações do simulado atualizadas.');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível atualizar o simulado.'
      );
    } finally {
      setSavingMeta(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!listId || !detail) return;
    setTogglingPublish(true);
    setError(null);
    setFeedback(null);
    try {
      const updated = await apiClient.updateList(listId, {
        is_published: !detail.is_published,
      });
      setDetail(updated);
      setFeedback(
        updated.is_published
          ? updated.is_standalone
            ? 'Simulado Avulso publicado! Qualquer aluno já pode acessá-lo.'
            : 'Simulado publicado! Os alunos da turma já podem acessá-lo.'
          : 'Simulado movido para rascunho.'
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível alterar o status de publicação.'
      );
    } finally {
      setTogglingPublish(false);
    }
  };

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicName.trim()) {
      setError('Informe o nome do novo assunto ou matéria.');
      return;
    }
    setSavingTopic(true);
    setError(null);
    setFeedback(null);
    try {
      const created = await apiClient.createTopic({
        name: newTopicName.trim(),
        description: newTopicDesc.trim() || null,
      });
      setTopics((prev) => [...prev, created]);
      setSelectedTopicId(String(created.id));
      setNewTopicName('');
      setNewTopicDesc('');
      setShowNewTopic(false);
      setFeedback(`Assunto "${created.name}" adicionado ao catálogo multidisciplinar.`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível criar o assunto.'
      );
    } finally {
      setSavingTopic(false);
    }
  };

  const resetQuestionForm = () => {
    setEditingQuestionId(null);
    setStatement('');
    setOptions({ ...EMPTY_OPTIONS });
    setCorrectOption('A');
    setExplanation('');
    if (topics.length > 0) {
      setSelectedTopicId(String(topics[0].id));
    }
  };

  const handleStartEditQuestion = (q: TeacherQuestionOut) => {
    setEditingQuestionId(q.id);
    setSelectedTopicId(String(q.topic_id));
    setStatement(q.statement);
    setOptions({ ...q.options });
    setCorrectOption(q.correct_option);
    setExplanation(q.explanation);
    document.getElementById('question-editor-form')?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listId || !detail) return;

    if (detail.has_submissions && !editingQuestionId) {
      setError(
        'A estrutura desta lista está congelada porque já existem entregas de alunos. Edite apenas as questões existentes.'
      );
      return;
    }

    const topicObj = topics.find((t) => String(t.id) === selectedTopicId);
    if (!detail.has_submissions && !topicObj) {
      setError('Selecione um assunto ou matéria para a questão.');
      return;
    }
    if (!statement.trim()) {
      setError('Digite o enunciado da questão.');
      return;
    }
    if (!detail.has_submissions && OPTION_KEYS.some((k) => !options[k].trim())) {
      setError('Preencha todas as quatro alternativas (A, B, C e D).');
      return;
    }
    if (!explanation.trim()) {
      setError('Inclua uma resolução comentada para o feedback do aluno.');
      return;
    }

    setSavingQuestion(true);
    setError(null);
    setFeedback(null);
    try {
      const cleanedOptions: QuestionOptions = {
        A: options.A.trim(),
        B: options.B.trim(),
        C: options.C.trim(),
        D: options.D.trim(),
      };

      if (editingQuestionId) {
        if (detail.has_submissions) {
          await apiClient.updateQuestion(editingQuestionId, {
            statement: statement.trim(),
            explanation: explanation.trim(),
          });
        } else {
          await apiClient.updateQuestion(editingQuestionId, {
            topic_id: topicObj!.id,
            statement: statement.trim(),
            options: cleanedOptions,
            correct_option: correctOption,
            explanation: explanation.trim(),
          });
        }
        setFeedback('Questão atualizada com sucesso.');
      } else {
        await apiClient.createQuestion(listId, {
          topic_id: topicObj!.id,
          statement: statement.trim(),
          options: cleanedOptions,
          correct_option: correctOption,
          explanation: explanation.trim(),
        });
        setFeedback('Nova questão adicionada ao simulado.');
      }

      resetQuestionForm();
      await loadListAndTopics();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível salvar a questão.'
      );
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (questionId: EntityId) => {
    setDeletingQuestionId(questionId);
    setError(null);
    setFeedback(null);
    try {
      await apiClient.deleteQuestion(questionId);
      if (editingQuestionId === questionId) {
        resetQuestionForm();
      }
      setFeedback('Questão removida da lista.');
      await loadListAndTopics();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível excluir a questão.'
      );
    } finally {
      setDeletingQuestionId(null);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/teacher/classrooms"
            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#4B5568] hover:text-[#131B2E]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar para Turmas e Simulados
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
                onClick={() => void loadListAndTopics()}
              >
                Recarregar
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {feedback && <Alert tone="success">{feedback}</Alert>}

        {loading ? (
          <LoadingState label="Carregando editor de simulado..." variant="detail" />
        ) : !detail ? null : (
          <>
            {/* Metadata & Publish Controls */}
            <Card>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#DCE1EB] pb-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <ListContextBadges
                      isStandalone={detail.is_standalone}
                      classroomName={detail.classroom_name}
                      organizationName={detail.organization_name}
                    />
                    <VisibilityBadge visibility={detail.visibility} entity="masculine" />
                    {detail.is_published ? (
                      <Badge tone="success">Publicado para alunos</Badge>
                    ) : (
                      <Badge tone="warning">Rascunho (oculto)</Badge>
                    )}
                    <span className="font-mono text-xs font-semibold text-[#4B5568] tabular-nums">
                      {detail.question_count} questões · {detail.submission_count} entregas
                    </span>
                  </div>

                  {!detail.is_standalone &&
                  detail.visibility === 'private' &&
                  detail.access_code ? (
                    <div>
                      <AccessCodeDisplay code={detail.access_code} />
                    </div>
                  ) : null}
                </div>

                <Button
                  variant={detail.is_published ? 'outline' : 'success'}
                  isLoading={togglingPublish}
                  leftIcon={
                    detail.is_published ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )
                  }
                  onClick={() => void handleTogglePublish()}
                >
                  {detail.is_published ? 'Mover para Rascunho' : 'Publicar Simulado'}
                </Button>
              </div>

              {detail.has_submissions && (
                <Alert tone="warning" className="mt-4">
                  A estrutura e classificação deste simulado estão congeladas pois já existem
                  entregas registradas ({detail.submission_count}). Não é possível alterar a turma
                  ou adicionar/remover questões; você ainda pode editar título, descrição,
                  visibilidade e corrigir enunciados ou resoluções.
                </Alert>
              )}

              <form onSubmit={handleSaveMetadata} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="list-title" className="block text-sm font-semibold text-[#131B2E]">
                      Título do simulado
                    </label>
                    <input
                      id="list-title"
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="list-desc" className="block text-sm font-semibold text-[#131B2E]">
                      Descrição / instruções
                    </label>
                    <input
                      id="list-desc"
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                    />
                  </div>
                </div>

                {/* Classification & Visibility Controls */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div>
                    <span className="block text-sm font-semibold text-[#131B2E] mb-1.5">
                      Classificação
                    </span>
                    <div
                      className="grid grid-cols-2 gap-2.5"
                      role="radiogroup"
                      aria-label="Classificação do simulado"
                    >
                      <button
                        type="button"
                        role="radio"
                        disabled={detail.has_submissions}
                        aria-checked={!isStandalone}
                        onClick={() => setIsStandalone(false)}
                        className={clsx(
                          'min-h-[44px] flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed',
                          !isStandalone
                            ? 'border-[#1B4FD8] bg-[#EEF3FF] text-[#1640B0] ring-1 ring-[#1B4FD8]'
                            : 'border-[#DCE1EB] bg-white text-[#4B5568]'
                        )}
                      >
                        <BookOpen className="h-4 w-4" aria-hidden="true" />
                        De Turma
                      </button>
                      <button
                        type="button"
                        role="radio"
                        disabled={detail.has_submissions}
                        aria-checked={isStandalone}
                        onClick={() => {
                          setIsStandalone(true);
                          setVisibility('public');
                        }}
                        className={clsx(
                          'min-h-[44px] flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed',
                          isStandalone
                            ? 'border-[#1B4FD8] bg-[#EEF3FF] text-[#1640B0] ring-1 ring-[#1B4FD8]'
                            : 'border-[#DCE1EB] bg-white text-[#4B5568]'
                        )}
                      >
                        <Layers className="h-4 w-4" aria-hidden="true" />
                        Simulado Avulso
                      </button>
                    </div>
                  </div>

                  {!isStandalone ? (
                    <div>
                      <label
                        htmlFor="edit-list-classroom"
                        className="block text-sm font-semibold text-[#131B2E]"
                      >
                        Turma vinculada
                      </label>
                      <select
                        id="edit-list-classroom"
                        value={classroomId}
                        disabled={detail.has_submissions}
                        onChange={(e) => setClassroomId(e.target.value)}
                        className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] disabled:bg-[#F8F8F5] disabled:text-[#4B5568] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                      >
                        {classrooms.length === 0 && detail.classroom_name ? (
                          <option value={String(detail.classroom_id ?? '')}>
                            {detail.classroom_name}
                          </option>
                        ) : (
                          classrooms.map((c) => (
                            <option key={String(c.id)} value={String(c.id)}>
                              {c.name}
                              {c.organization_name ? ` (${c.organization_name})` : ''}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-[#C7D7FE] bg-[#EEF3FF] px-3.5 py-2.5 text-xs text-[#1640B0] flex items-center gap-2">
                      <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        Simulados Avulsos são sempre públicos e acessíveis a qualquer aluno após
                        publicação.
                      </span>
                    </div>
                  )}
                </div>

                {!isStandalone && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    <div>
                      <span className="block text-sm font-semibold text-[#131B2E] mb-1.5">
                        Visibilidade na turma
                      </span>
                      <div
                        className="grid grid-cols-2 gap-2.5"
                        role="radiogroup"
                        aria-label="Visibilidade do simulado"
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={visibility === 'public'}
                          onClick={() => setVisibility('public')}
                          className={clsx(
                            'min-h-[44px] flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors cursor-pointer',
                            visibility === 'public'
                              ? 'border-[#1B4FD8] bg-[#EEF3FF] text-[#1640B0] ring-1 ring-[#1B4FD8]'
                              : 'border-[#DCE1EB] bg-white text-[#4B5568]'
                          )}
                        >
                          <Globe className="h-4 w-4" aria-hidden="true" />
                          Público
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={visibility === 'private'}
                          onClick={() => setVisibility('private')}
                          className={clsx(
                            'min-h-[44px] flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors cursor-pointer',
                            visibility === 'private'
                              ? 'border-[#1B4FD8] bg-[#EEF3FF] text-[#1640B0] ring-1 ring-[#1B4FD8]'
                              : 'border-[#DCE1EB] bg-white text-[#4B5568]'
                          )}
                        >
                          <Lock className="h-4 w-4" aria-hidden="true" />
                          Privado
                        </button>
                      </div>
                    </div>

                    {visibility === 'private' && (
                      <div>
                        <label
                          htmlFor="edit-list-access-code"
                          className="block text-sm font-semibold text-[#131B2E]"
                        >
                          Código de acesso do simulado
                        </label>
                        <input
                          id="edit-list-access-code"
                          type="text"
                          required
                          minLength={4}
                          maxLength={64}
                          value={accessCode}
                          onChange={(e) => setAccessCode(e.target.value)}
                          placeholder="Ex.: DESAFIO26"
                          className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 font-mono text-base sm:text-sm tracking-wider text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                        />
                      </div>
                    )}
                  </div>
                )}

                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  isLoading={savingMeta}
                  leftIcon={<Save className="h-3.5 w-3.5" />}
                >
                  Salvar Dados da Lista
                </Button>
              </form>
            </Card>

            {/* Question Creator / Editor */}
            <Card>
              <div id="question-editor-form">
                <CardHeader
                  title={
                    editingQuestionId
                      ? 'Editar Questão de Múltipla Escolha'
                      : 'Adicionar Questão de Múltipla Escolha (A–D)'
                  }
                  description={
                    detail.has_submissions
                      ? 'Lista com entregas: apenas enunciado e resolução comentada das questões existentes podem ser editados.'
                      : 'Vincule o assunto ou matéria de qualquer disciplina, informe as quatro alternativas e escreva a resolução comentada.'
                  }
                  actions={
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={detail.has_submissions}
                      leftIcon={<Plus className="h-3.5 w-3.5" />}
                      onClick={() => setShowNewTopic((prev) => !prev)}
                    >
                      Novo Assunto / Matéria
                    </Button>
                  }
                />
              </div>

              {detail.has_submissions && !editingQuestionId && (
                <Alert tone="warning" className="mt-4">
                  Não é possível adicionar novas questões porque a estrutura da lista está congelada
                  após o recebimento de entregas. Clique em <strong>Editar</strong> em uma questão
                  abaixo para ajustar o enunciado ou a resolução comentada.
                </Alert>
              )}

              {detail.has_submissions && editingQuestionId && (
                <Alert tone="info" className="mt-4">
                  Modo de edição segura: assunto, alternativas e gabarito estão bloqueados porque já
                  existem entregas. Você pode atualizar apenas o enunciado e a resolução comentada.
                </Alert>
              )}

              {showNewTopic && !detail.has_submissions && (
                <form
                  onSubmit={handleCreateTopic}
                  className="mt-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3"
                >
                  <p className="text-sm font-bold text-[#131B2E]">
                    Cadastrar Novo Assunto ou Matéria
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={newTopicName}
                      onChange={(e) => setNewTopicName(e.target.value)}
                      placeholder="Nome (ex.: Química Orgânica, História Contemporânea)"
                      aria-label="Nome do novo assunto ou matéria"
                      className="block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E]"
                    />
                    <input
                      type="text"
                      value={newTopicDesc}
                      onChange={(e) => setNewTopicDesc(e.target.value)}
                      placeholder="Descrição curta (opcional)"
                      aria-label="Descrição do novo assunto"
                      className="block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E]"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="submit" variant="primary" size="sm" isLoading={savingTopic}>
                      Salvar Assunto
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowNewTopic(false)}
                    >
                      Fechar
                    </Button>
                  </div>
                </form>
              )}

              <form onSubmit={handleSaveQuestion} className="mt-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="question-topic"
                        className="block text-sm font-semibold text-[#131B2E]"
                      >
                        Assunto / Matéria
                      </label>
                      {!detail.has_submissions && (
                        <button
                          type="button"
                          onClick={() => setShowNewTopic((prev) => !prev)}
                          className="text-xs font-semibold text-[#1B4FD8] hover:underline cursor-pointer"
                        >
                          {showNewTopic ? 'Fechar cadastro' : '+ Criar novo assunto'}
                        </button>
                      )}
                    </div>
                    <select
                      id="question-topic"
                      value={selectedTopicId}
                      disabled={detail.has_submissions}
                      onChange={(e) => setSelectedTopicId(e.target.value)}
                      className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] disabled:bg-[#F8F8F5] disabled:text-[#4B5568] disabled:cursor-not-allowed focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                    >
                      {topics.length === 0 ? (
                        <option value="">Cadastre um assunto primeiro</option>
                      ) : (
                        topics.map((t) => (
                          <option key={String(t.id)} value={String(t.id)}>
                            {t.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="question-correct"
                      className="block text-sm font-semibold text-[#131B2E]"
                    >
                      Alternativa correta (Gabarito)
                    </label>
                    <select
                      id="question-correct"
                      value={correctOption}
                      disabled={detail.has_submissions}
                      onChange={(e) => setCorrectOption(e.target.value as OptionKey)}
                      className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm font-semibold text-[#131B2E] disabled:bg-[#F8F8F5] disabled:text-[#4B5568] disabled:cursor-not-allowed focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                    >
                      {OPTION_KEYS.map((key) => (
                        <option key={key} value={key}>
                          Alternativa {key}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="question-statement"
                    className="block text-sm font-semibold text-[#131B2E]"
                  >
                    Enunciado da questão
                  </label>
                  <textarea
                    id="question-statement"
                    rows={3}
                    required
                    disabled={detail.has_submissions && !editingQuestionId}
                    value={statement}
                    onChange={(e) => setStatement(e.target.value)}
                    placeholder="Ex.: Qual organela celular é responsável pela respiração celular aeróbica?"
                    className="mt-1.5 block w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2.5 text-base sm:text-sm text-[#131B2E] placeholder:text-slate-400 disabled:bg-[#F8F8F5] disabled:text-[#4B5568] disabled:cursor-not-allowed focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {OPTION_KEYS.map((optKey) => (
                    <div key={optKey}>
                      <label
                        htmlFor={`option-${optKey}`}
                        className="block text-xs font-bold text-[#131B2E] mb-1"
                      >
                        Alternativa <span className="font-mono">{optKey}</span>{' '}
                        {correctOption === optKey ? (
                          <span className="text-[#065F46]">(Correta)</span>
                        ) : null}
                      </label>
                      <input
                        id={`option-${optKey}`}
                        type="text"
                        required
                        disabled={detail.has_submissions}
                        value={options[optKey]}
                        onChange={(e) =>
                          setOptions((prev) => ({ ...prev, [optKey]: e.target.value }))
                        }
                        placeholder={`Texto da alternativa ${optKey}`}
                        className={clsx(
                          'block min-h-[44px] w-full rounded-lg border bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E] disabled:bg-[#F8F8F5] disabled:text-[#4B5568] disabled:cursor-not-allowed focus:outline-none focus:ring-2',
                          correctOption === optKey
                            ? 'border-[#0F766E] focus:border-[#0F766E] focus:ring-[#0F766E]/20'
                            : 'border-[#CBD3E1] focus:border-[#1B4FD8] focus:ring-[#1B4FD8]/20'
                        )}
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label
                    htmlFor="question-explanation"
                    className="block text-sm font-semibold text-[#131B2E]"
                  >
                    Resolução comentada (exibida ao aluno após a entrega)
                  </label>
                  <textarea
                    id="question-explanation"
                    rows={2}
                    required
                    disabled={detail.has_submissions && !editingQuestionId}
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder="Ex.: As mitocôndrias realizam o ciclo de Krebs e a cadeia respiratória para produzir ATP."
                    className="mt-1.5 block w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2 text-base sm:text-sm text-[#131B2E] placeholder:text-slate-400 disabled:bg-[#F8F8F5] disabled:text-[#4B5568] disabled:cursor-not-allowed focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={savingQuestion}
                    disabled={topics.length === 0 || (detail.has_submissions && !editingQuestionId)}
                    leftIcon={
                      editingQuestionId ? (
                        <Save className="h-4 w-4" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )
                    }
                  >
                    {editingQuestionId ? 'Atualizar Questão' : 'Adicionar Questão à Lista'}
                  </Button>
                  {editingQuestionId && (
                    <Button type="button" variant="ghost" onClick={resetQuestionForm}>
                      Cancelar Edição
                    </Button>
                  )}
                </div>
              </form>
            </Card>

            {/* Questions List */}
            <section aria-labelledby="questions-preview-heading" className="space-y-4">
              <h2 id="questions-preview-heading" className="font-display text-lg font-bold text-[#131B2E]">
                Questões do Simulado ({sortedQuestions.length})
              </h2>

              {sortedQuestions.length === 0 ? (
                <EmptyState
                  icon={<Plus className="h-6 w-6" />}
                  title="Nenhuma questão cadastrada"
                  description="Use o formulário acima para adicionar questões de múltipla escolha (A–D) com assunto e resolução."
                />
              ) : (
                <div className="space-y-4">
                  {sortedQuestions.map((q, index) => (
                    <Card key={String(q.id)} className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-[#4B5568] tabular-nums">
                            Questão {index + 1}
                          </span>
                          <Badge tone="primary">{q.topic_name}</Badge>
                          <Badge tone="success">
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            Gabarito: {q.correct_option}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Edit3 className="h-3.5 w-3.5" />}
                            onClick={() => handleStartEditQuestion(q)}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={detail.has_submissions}
                            isLoading={deletingQuestionId === q.id}
                            title={
                              detail.has_submissions
                                ? 'Questões não podem ser excluídas após a lista receber entregas.'
                                : 'Excluir questão'
                            }
                            aria-label={`Excluir questão ${index + 1}`}
                            onClick={() => void handleDeleteQuestion(q.id)}
                          >
                            <Trash2 className="h-4 w-4 text-rose-700" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>

                      <p className="text-base font-semibold text-[#131B2E] whitespace-pre-line max-w-[75ch]">
                        {q.statement}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {OPTION_KEYS.map((key) => {
                          const isCorrect = q.correct_option === key;
                          return (
                            <div
                              key={key}
                              className={clsx(
                                'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                                isCorrect
                                  ? 'border-emerald-300 bg-emerald-50/70 font-semibold text-emerald-950'
                                  : 'border-[#DCE1EB] bg-white text-[#334155]'
                              )}
                            >
                              <span
                                className={clsx(
                                  'flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-xs font-bold',
                                  isCorrect
                                    ? 'bg-emerald-700 text-white'
                                    : 'bg-[#EEF1F7] text-[#334155]'
                                )}
                              >
                                {key}
                              </span>
                              <span>{q.options[key]}</span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="rounded-lg border border-[#DCE1EB] bg-[#F8F8F5] px-3.5 py-2.5 text-xs text-[#334155]">
                        <span className="font-bold text-[#131B2E]">Resolução comentada:</span>{' '}
                        {q.explanation}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

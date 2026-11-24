import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Clock, Layers, RefreshCw, Search, Users } from 'lucide-react';
import { clsx } from 'clsx';
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
import {
  formatDateTime,
  formatPercent,
  getPerformanceTierMeta,
} from '../../lib/formatters';
import type {
  ListTypeFilter,
  TeacherClassroomOut,
  TeacherListSummaryOut,
  TeacherOrganizationOut,
  TeacherStudentSummaryOut,
} from '../../types/api';

export function TeacherStudentsPage() {
  const [organizations, setOrganizations] = useState<TeacherOrganizationOut[]>([]);
  const [classrooms, setClassrooms] = useState<TeacherClassroomOut[]>([]);
  const [standaloneLists, setStandaloneLists] = useState<TeacherListSummaryOut[]>([]);
  const [students, setStudents] = useState<TeacherStudentSummaryOut[]>([]);

  const [listType, setListType] = useState<ListTypeFilter>('all');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetadata = useCallback(async () => {
    try {
      const [orgs, cls, lists] = await Promise.all([
        apiClient.getTeacherOrganizations().catch(() => [] as TeacherOrganizationOut[]),
        apiClient.getTeacherClassrooms(),
        apiClient.getTeacherLists({ listType: 'standalone' }).catch(() => [] as TeacherListSummaryOut[]),
      ]);
      setOrganizations(orgs.filter((o) => o.is_member));
      setClassrooms(cls);
      setStandaloneLists(lists.filter((l) => l.is_standalone));
    } catch {
      // Metadata errors handled on students load
    }
  }, []);

  const loadStudents = useCallback(
    async (params: {
      listType: ListTypeFilter;
      organizationId: string;
      classroomId: string;
      listId: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const isStandalone = params.listType === 'standalone';
        const data = await apiClient.getTeacherStudents({
          listType: params.listType,
          organizationId: isStandalone ? null : params.organizationId || null,
          classroomId: isStandalone ? null : params.classroomId || null,
          listId: isStandalone ? params.listId || null : null,
        });
        setStudents(data);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Não foi possível carregar a lista de alunos.'
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    void loadStudents({
      listType,
      organizationId: selectedOrgId,
      classroomId: selectedClassroomId,
      listId: selectedListId,
    });
  }, [loadStudents, listType, selectedOrgId, selectedClassroomId, selectedListId]);

  const visibleClassrooms = useMemo(() => {
    if (!selectedOrgId) return classrooms;
    return classrooms.filter((c) => String(c.organization_id) === selectedOrgId);
  }, [classrooms, selectedOrgId]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
    );
  }, [students, searchQuery]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#DCE1EB] pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#131B2E]">
              Desempenho dos Alunos
            </h1>
            <p className="mt-1 text-sm text-[#4B5568]">
              Acompanhe a evolução individual, participação em turmas e entregas em simulados
              avulsos.
            </p>
          </div>
          <Link to="/teacher/dashboard">
            <Button variant="outline">Voltar à Visão Analítica</Button>
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
                onClick={() =>
                  void loadStudents({
                    listType,
                    organizationId: selectedOrgId,
                    classroomId: selectedClassroomId,
                    listId: selectedListId,
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

        {/* Filter Bar */}
        <Card padding="sm">
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-end">
              <div>
                <span className="block text-xs font-bold text-[#131B2E] mb-1.5">
                  Origem da participação
                </span>
                <div
                  role="group"
                  aria-label="Filtrar alunos por origem"
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
                        setListType(opt.value);
                        setSelectedOrgId('');
                        setSelectedClassroomId('');
                        setSelectedListId('');
                      }}
                      className={clsx(
                        'min-h-[44px] sm:min-h-[36px] rounded-md px-2 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                        listType === opt.value
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
                  htmlFor="students-search"
                  className="block text-xs font-bold text-[#131B2E] mb-1.5"
                >
                  Buscar por nome ou e-mail
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="students-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Digite o nome ou e-mail do aluno..."
                    className="block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white pl-9 pr-3 py-2 text-base sm:text-sm text-[#131B2E] placeholder:text-slate-400 focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                </div>
              </div>
            </div>

            {listType !== 'standalone' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[#DCE1EB] pt-3">
                <div>
                  <label
                    htmlFor="students-org-filter"
                    className="block text-xs font-bold text-[#131B2E] mb-1.5"
                  >
                    Filtrar por organização
                  </label>
                  <select
                    id="students-org-filter"
                    value={selectedOrgId}
                    onChange={(e) => {
                      setSelectedOrgId(e.target.value);
                      setSelectedClassroomId('');
                    }}
                    className="block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  >
                    <option value="">Todas as organizações</option>
                    {organizations.map((org) => (
                      <option key={String(org.id)} value={String(org.id)}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="students-classroom-filter"
                    className="block text-xs font-bold text-[#131B2E] mb-1.5"
                  >
                    Filtrar por turma
                  </label>
                  <select
                    id="students-classroom-filter"
                    value={selectedClassroomId}
                    onChange={(e) => setSelectedClassroomId(e.target.value)}
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
              </div>
            ) : (
              <div className="border-t border-[#DCE1EB] pt-3 max-w-md">
                <label
                  htmlFor="students-standalone-filter"
                  className="block text-xs font-bold text-[#131B2E] mb-1.5"
                >
                  Filtrar por Simulado Avulso
                </label>
                <select
                  id="students-standalone-filter"
                  value={selectedListId}
                  onChange={(e) => setSelectedListId(e.target.value)}
                  className="block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                >
                  <option value="">Todos os simulados avulsos</option>
                  {standaloneLists.map((l) => (
                    <option key={String(l.id)} value={String(l.id)}>
                      {l.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </Card>

        {loading ? (
          <LoadingState label="Carregando alunos..." variant="table" rows={5} />
        ) : filteredStudents.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Nenhum aluno encontrado"
            description={
              searchQuery || selectedClassroomId || selectedOrgId || selectedListId
                ? 'Tente ajustar os filtros aplicados ou o termo de busca.'
                : 'Ainda não há alunos matriculados em suas turmas ou participantes em simulados avulsos.'
            }
            action={
              searchQuery || selectedClassroomId || selectedOrgId || selectedListId || listType !== 'all' ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setListType('all');
                    setSelectedOrgId('');
                    setSelectedClassroomId('');
                    setSelectedListId('');
                  }}
                >
                  Limpar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#DCE1EB] bg-[#F8F8F5] text-xs font-bold text-[#4B5568]">
                    <th className="px-5 py-3.5">Aluno</th>
                    <th className="px-5 py-3.5">Turmas e Origem</th>
                    <th className="px-5 py-3.5">Listas / Tentativas</th>
                    <th className="px-5 py-3.5">Média Geral</th>
                    <th className="px-5 py-3.5">Última Entrega</th>
                    <th className="px-5 py-3.5 text-right">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE1EB] text-sm">
                  {filteredStudents.map((student) => {
                    const hasSubmissions =
                      student.lists_completed_count > 0 &&
                      student.average_score_percentage !== null;
                    const avgMeta = hasSubmissions
                      ? getPerformanceTierMeta(student.average_score_percentage!)
                      : null;

                    return (
                      <tr key={String(student.student_id)} className="hover:bg-[#F8F8F5]/70">
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-[#131B2E]">{student.name}</span>
                            {student.has_pending_retake && (
                              <Badge tone="warning">
                                <Clock className="h-3 w-3" aria-hidden="true" />
                                Pediu retake
                              </Badge>
                            )}
                          </div>
                          <p className="font-mono text-xs text-[#4B5568]">{student.email}</p>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {student.classrooms.map((c) => (
                              <Badge key={String(c.id)} tone="navy">
                                {c.organization_name ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Building2 className="h-3 w-3 opacity-80" aria-hidden="true" />
                                    {c.organization_name} · {c.name}
                                  </span>
                                ) : (
                                  c.name
                                )}
                              </Badge>
                            ))}
                            {(student.standalone_submissions_count ?? 0) > 0 && (
                              <Badge tone="primary">
                                <Layers className="h-3 w-3" aria-hidden="true" />
                                Avulsos ({student.standalone_submissions_count})
                              </Badge>
                            )}
                            {student.classrooms.length === 0 &&
                              !(student.standalone_submissions_count ?? 0) && (
                                <span className="text-xs text-[#4B5568]">Sem vínculo</span>
                              )}
                          </div>
                        </td>

                        <td className="px-5 py-4 font-mono tabular-nums text-xs font-semibold text-[#131B2E]">
                          {student.lists_completed_count} listas · {student.total_attempts_count}{' '}
                          {student.total_attempts_count === 1 ? 'tentativa' : 'tentativas'}
                        </td>

                        <td className="px-5 py-4 tabular-nums">
                          {avgMeta && hasSubmissions ? (
                            <Badge tone={avgMeta.badgeTone} className="font-mono">
                              {formatPercent(student.average_score_percentage, 1)}
                            </Badge>
                          ) : (
                            <span className="text-xs text-[#4B5568]">Sem entregas</span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-xs text-[#4B5568] whitespace-nowrap">
                          {formatDateTime(student.last_submitted_at)}
                        </td>

                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <Link to={`/teacher/students/${student.student_id}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                            >
                              Ver Aluno
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

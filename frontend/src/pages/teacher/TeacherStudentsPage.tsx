import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, RefreshCw, Search, Users } from 'lucide-react';
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
import type { TeacherClassroomOut, TeacherStudentSummaryOut } from '../../types/api';

export function TeacherStudentsPage() {
  const [classrooms, setClassrooms] = useState<TeacherClassroomOut[]>([]);
  const [students, setStudents] = useState<TeacherStudentSummaryOut[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStudents = useCallback(async (classroomId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [cls, stu] = await Promise.all([
        apiClient.getTeacherClassrooms(),
        apiClient.getTeacherStudents(classroomId || null),
      ]);
      setClassrooms(cls);
      setStudents(stu);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar a lista de alunos.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStudents(selectedClassroomId);
  }, [loadStudents, selectedClassroomId]);

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
              Acompanhe a evolução individual, tentativas utilizadas e média de acertos em suas
              turmas.
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
                onClick={() => void loadStudents(selectedClassroomId)}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
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
                <option value="">Todas as turmas</option>
                {classrooms.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {c.name} ({c.student_count} alunos)
                  </option>
                ))}
              </select>
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
        </Card>

        {loading ? (
          <LoadingState label="Carregando alunos..." variant="table" rows={5} />
        ) : filteredStudents.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Nenhum aluno encontrado"
            description={
              searchQuery || selectedClassroomId
                ? 'Tente ajustar o filtro de turma ou o termo de busca.'
                : 'Ainda não há alunos matriculados em suas turmas.'
            }
            action={
              searchQuery || selectedClassroomId ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedClassroomId('');
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
                    <th className="px-5 py-3.5">Turmas</th>
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
                                {c.name}
                              </Badge>
                            ))}
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

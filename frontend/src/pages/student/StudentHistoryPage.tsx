import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, History, MessageSquareText, RefreshCw } from 'lucide-react';
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
  formatRetakeStatus,
  formatScoreRatio,
  getPerformanceTierMeta,
} from '../../lib/formatters';
import type { StudentSubmissionSummaryOut } from '../../types/api';

export function StudentHistoryPage() {
  const [submissions, setSubmissions] = useState<StudentSubmissionSummaryOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classroomFilter, setClassroomFilter] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getStudentSubmissions();
      setSubmissions(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar seu histórico de entregas.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const classroomOptions = useMemo(() => {
    const map = new Map<string, string>();
    submissions.forEach((s) => map.set(String(s.classroom_id), s.classroom_name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    if (!classroomFilter) return submissions;
    return submissions.filter((s) => String(s.classroom_id) === classroomFilter);
  }, [submissions, classroomFilter]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#DCE1EB] pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#131B2E]">
              Histórico e Feedbacks
            </h1>
            <p className="mt-1 text-sm text-[#4B5568]">
              Consulte todas as tentativas realizadas, notas, comentários dos professores e status de
              refazer.
            </p>
          </div>
          <Link to="/student/dashboard">
            <Button variant="outline">Ir para Simulados</Button>
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
                onClick={() => void loadHistory()}
              >
                Tentar novamente
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {classroomOptions.length > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[10px] border border-[#DCE1EB] bg-white px-4 py-3 shadow-card">
            <label htmlFor="history-classroom-filter" className="text-sm font-semibold text-[#131B2E]">
              Filtrar por turma
            </label>
            <select
              id="history-classroom-filter"
              value={classroomFilter}
              onChange={(e) => setClassroomFilter(e.target.value)}
              className="min-h-[44px] w-full sm:w-64 rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-base sm:text-sm text-[#131B2E] focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
            >
              <option value="">Todas as turmas</option>
              {classroomOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <LoadingState label="Carregando histórico..." variant="table" rows={4} />
        ) : filteredSubmissions.length === 0 ? (
          <EmptyState
            icon={<History className="h-6 w-6" />}
            title="Nenhuma avaliação entregue ainda"
            description="Quando você responder e enviar um simulado, todas as suas tentativas aparecerão aqui."
            action={
              <Link to="/student/dashboard">
                <Button variant="primary">Ver simulados disponíveis</Button>
              </Link>
            }
          />
        ) : (
          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#DCE1EB] bg-[#F8F8F5] text-xs font-bold text-[#4B5568]">
                    <th className="px-5 py-3.5">Simulado / Turma</th>
                    <th className="px-5 py-3.5">Tentativa</th>
                    <th className="px-5 py-3.5">Desempenho</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Data da Entrega</th>
                    <th className="px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE1EB] text-sm">
                  {filteredSubmissions.map((sub) => {
                    const tier = getPerformanceTierMeta(sub.score_percentage);
                    const retake = formatRetakeStatus(sub.retake_status);
                    return (
                      <tr key={String(sub.submission_id)} className="hover:bg-[#F8F8F5]/70">
                        <td className="px-5 py-4">
                          <p className="font-bold text-[#131B2E]">{sub.question_list_title}</p>
                          <p className="text-xs text-[#4B5568]">{sub.classroom_name}</p>
                        </td>
                        <td className="px-5 py-4 tabular-nums">
                          <Badge tone="navy" className="font-mono">
                            Tentativa #{sub.attempt_number} de {sub.attempts_used_total}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 tabular-nums">
                          <div className="flex items-center gap-2">
                            <Badge tone={tier.badgeTone} className="font-mono">
                              {formatPercent(sub.score_percentage)}
                            </Badge>
                            <span className="font-mono text-xs text-[#4B5568]">
                              ({formatScoreRatio(sub.correct_count, sub.total_questions)})
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col items-start gap-1">
                            {sub.has_teacher_comment && (
                              <Badge tone="primary">
                                <MessageSquareText className="h-3 w-3" aria-hidden="true" />
                                Comentário
                              </Badge>
                            )}
                            {sub.can_attempt ? (
                              <Badge tone="success">Nova tentativa liberada</Badge>
                            ) : sub.retake_status !== 'none' ? (
                              <Badge tone={retake.tone}>{retake.label}</Badge>
                            ) : (
                              <span className="text-xs text-slate-500">Concluída</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-600 whitespace-nowrap">
                          {formatDateTime(sub.submitted_at)}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <Link to={`/student/submissions/${sub.submission_id}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                            >
                              Ver Feedback
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

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { AuthProvider } from '../contexts/AuthContext';
import { apiClient, setStoredToken } from '../lib/apiClient';
import type { SubmissionFeedbackOut } from '../types/api';

const TEACHER_USER = {
  id: 1,
  name: 'Ana Paula',
  email: 'ana.paula@synapta.edu',
  role: 'teacher' as const,
  created_at: '2026-11-23T10:00:00Z',
};

function renderTeacherRoute(route: string) {
  setStoredToken('teacher-token');
  vi.spyOn(apiClient, 'me').mockResolvedValue(TEACHER_USER);
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('TeacherDashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza KPIs, destaques por assunto, simulados avulsos e autoriza retake pendente', async () => {
    const user = userEvent.setup();

    vi.spyOn(apiClient, 'getTeacherOrganizations').mockResolvedValue([
      {
        id: 10,
        name: 'Instituto Horizonte',
        description: 'Rede multidisciplinar',
        visibility: 'public',
        is_owner: true,
        is_member: true,
        access_code: null,
        owner_id: 1,
        owner_name: 'Ana Paula',
        teacher_count: 2,
        classroom_count: 1,
        student_count: 15,
        created_at: '2026-11-20T10:00:00Z',
      },
    ]);
    vi.spyOn(apiClient, 'getTeacherClassrooms').mockResolvedValue([
      {
        id: 1,
        name: '2º Ano A — Ciências',
        description: 'Turma manhã',
        organization_id: 10,
        organization_name: 'Instituto Horizonte',
        visibility: 'public',
        access_code: null,
        student_count: 15,
        list_count: 2,
        created_at: '2026-11-20T10:00:00Z',
      },
    ]);
    vi.spyOn(apiClient, 'getTeacherLists').mockResolvedValue([
      {
        id: 5,
        classroom_id: 1,
        classroom_name: '2º Ano A — Ciências',
        organization_id: 10,
        organization_name: 'Instituto Horizonte',
        is_standalone: false,
        visibility: 'public',
        access_code: null,
        title: 'Simulado 01',
        description: null,
        is_published: true,
        question_count: 4,
        submission_count: 10,
        created_at: '2026-11-20T10:00:00Z',
        updated_at: '2026-11-20T10:00:00Z',
      },
      {
        id: 9,
        classroom_id: null,
        classroom_name: null,
        organization_id: null,
        organization_name: null,
        is_standalone: true,
        visibility: 'public',
        access_code: null,
        title: 'Maratona Aberta de Conhecimentos Gerais',
        description: 'Aberta para todos os alunos',
        is_published: true,
        question_count: 6,
        submission_count: 14,
        created_at: '2026-11-21T10:00:00Z',
        updated_at: '2026-11-21T10:00:00Z',
      },
    ]);
    vi.spyOn(apiClient, 'getRetakeRequests').mockResolvedValue([
      {
        id: 99,
        question_list_id: 5,
        question_list_title: 'Simulado 01',
        classroom_id: 1,
        classroom_name: '2º Ano A — Ciências',
        organization_id: 10,
        organization_name: 'Instituto Horizonte',
        is_standalone: false,
        student_id: 2,
        student_name: 'Lucas Silva',
        student_email: 'lucas@synapta.edu',
        attempts_used: 1,
        last_score_percentage: 40,
        status: 'pending',
        request_reason: 'Quero tentar melhorar minha nota em genética.',
        created_at: '2026-11-23T11:00:00Z',
        reviewed_at: null,
      },
    ]);
    const analyticsSpy = vi.spyOn(apiClient, 'getTopicAnalytics').mockResolvedValue({
      kpis: {
        total_organizations: 1,
        total_classrooms: 1,
        total_students: 15,
        total_published_lists: 2,
        total_standalone_lists: 1,
        total_submissions: 24,
        overall_accuracy_percentage: 64.5,
        pending_retake_requests: 1,
      },
      topics: [
        {
          topic_id: 10,
          topic_name: 'Biologia Celular e Genética',
          total_answers: 20,
          correct_answers: 7,
          wrong_answers: 13,
          accuracy_percentage: 35,
        },
        {
          topic_id: 11,
          topic_name: 'História do Brasil',
          total_answers: 20,
          correct_answers: 18,
          wrong_answers: 2,
          accuracy_percentage: 90,
        },
      ],
      lowest_performing_topics: [
        {
          topic_id: 10,
          topic_name: 'Biologia Celular e Genética',
          total_answers: 20,
          correct_answers: 7,
          wrong_answers: 13,
          accuracy_percentage: 35,
        },
      ],
      highest_performing_topics: [
        {
          topic_id: 11,
          topic_name: 'História do Brasil',
          total_answers: 20,
          correct_answers: 18,
          wrong_answers: 2,
          accuracy_percentage: 90,
        },
      ],
      standalone_lists: [
        {
          list_id: 9,
          title: 'Maratona Aberta de Conhecimentos Gerais',
          submissions_count: 14,
          distinct_students_count: 12,
          average_score_percentage: 78.5,
        },
      ],
    });

    vi.spyOn(apiClient, 'decideRetakeRequest').mockResolvedValue({
      id: 99,
      question_list_id: 5,
      question_list_title: 'Simulado 01',
      classroom_id: 1,
      classroom_name: '2º Ano A — Ciências',
      organization_id: 10,
      organization_name: 'Instituto Horizonte',
      is_standalone: false,
      student_id: 2,
      student_name: 'Lucas Silva',
      student_email: 'lucas@synapta.edu',
      attempts_used: 1,
      last_score_percentage: 40,
      status: 'approved',
      request_reason: 'Quero tentar melhorar minha nota em genética.',
      created_at: '2026-11-23T11:00:00Z',
      reviewed_at: '2026-11-23T12:00:00Z',
    });

    renderTeacherRoute('/teacher/dashboard');

    expect(await screen.findByText('64,5%')).toBeInTheDocument();
    expect(screen.getByText('Biologia Celular e Genética')).toBeInTheDocument();
    expect(screen.getByText('História do Brasil')).toBeInTheDocument();
    expect(screen.getByText('Maratona Aberta de Conhecimentos Gerais')).toBeInTheDocument();
    expect(screen.getByText('78,5%')).toBeInTheDocument();
    expect(screen.getByText('Lucas Silva')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /autorizar nova tentativa/i }));

    await waitFor(() => {
      expect(apiClient.decideRetakeRequest).toHaveBeenCalledWith(99, 'approved');
    });
    expect(
      await screen.findByText(/nova tentativa autorizada para lucas silva/i)
    ).toBeInTheDocument();

    // Test switching filter mode to "Por Simulado Avulso" and picking the standalone list
    await user.click(screen.getByRole('button', { name: /por simulado avulso/i }));
    const standaloneSelect = await screen.findByLabelText(/^simulado avulso$/i);
    await user.selectOptions(standaloneSelect, '9');

    await waitFor(() => {
      expect(analyticsSpy).toHaveBeenLastCalledWith({
        listType: 'standalone',
        organizationId: null,
        classroomId: null,
        listId: '9',
        scope: 'latest',
      });
    });
  });

  it('permite ao professor escrever comentário manual e autorizar nova tentativa na página de entrega', async () => {
    const user = userEvent.setup();

    const baseSubmission: SubmissionFeedbackOut = {
      submission_id: 77,
      question_list_id: 5,
      question_list_title: 'Simulado 01',
      classroom_id: 1,
      classroom_name: '2º Ano A — Ciências',
      organization_id: null,
      organization_name: null,
      is_standalone: false,
      student_id: 2,
      student_name: 'Lucas Silva',
      student_email: 'lucas@synapta.edu',
      attempt_number: 1,
      attempts_used_total: 1,
      correct_count: 1,
      total_questions: 2,
      score_percentage: 50,
      performance_band: 'attention',
      teacher_comment: null,
      teacher_commented_at: null,
      retake_status: 'none',
      pending_retake_request_id: null,
      can_authorize_retake: true,
      can_attempt: false,
      submitted_at: '2026-11-23T11:30:00Z',
      topic_breakdown: [],
      questions_feedback: [],
    };

    vi.spyOn(apiClient, 'getTeacherSubmissionDetail').mockResolvedValue(baseSubmission);
    vi.spyOn(apiClient, 'updateSubmissionComment').mockResolvedValue({
      ...baseSubmission,
      teacher_comment: 'Continue praticando interpretação textual!',
      teacher_commented_at: '2026-11-23T12:00:00Z',
    });

    renderTeacherRoute('/teacher/submissions/77');

    const textarea = await screen.findByLabelText(/comentário manual do professor/i);
    await user.type(textarea, 'Continue praticando interpretação textual!');
    await user.click(screen.getByRole('button', { name: /salvar comentário/i }));

    await waitFor(() => {
      expect(apiClient.updateSubmissionComment).toHaveBeenCalledWith(
        '77',
        'Continue praticando interpretação textual!'
      );
    });
    expect(
      await screen.findByText(/comentário do professor salvo e visível para o aluno/i)
    ).toBeInTheDocument();
  });

  it('exibe perfil individual do aluno com pontos fortes/fracos e permite liberar nova tentativa', async () => {
    const user = userEvent.setup();

    vi.spyOn(apiClient, 'getTeacherLists').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getTeacherStudentDetail').mockResolvedValue({
      student: {
        id: 2,
        name: 'Lucas Silva',
        email: 'lucas@synapta.edu',
        classrooms: [{ id: 1, name: '2º Ano A — Ciências', visibility: 'public' }],
      },
      summary: {
        average_score_percentage: 68.5,
        lists_completed_count: 2,
        total_attempts_count: 3,
        standalone_submissions_count: 1,
        strongest_topic: 'História do Brasil',
        weakest_topic: 'Biologia Celular e Genética',
      },
      topic_performance: [
        {
          topic_id: 10,
          topic_name: 'Biologia Celular e Genética',
          total_answers: 6,
          correct_answers: 2,
          wrong_answers: 4,
          accuracy_percentage: 33.3,
        },
        {
          topic_id: 11,
          topic_name: 'História do Brasil',
          total_answers: 6,
          correct_answers: 6,
          wrong_answers: 0,
          accuracy_percentage: 100,
        },
      ],
      submissions: [
        {
          submission_id: 88,
          question_list_id: 5,
          question_list_title: 'Simulado 01 — Diagnóstico',
          classroom_id: null,
          classroom_name: null,
          organization_id: null,
          organization_name: null,
          is_standalone: true,
          attempt_number: 1,
          attempts_on_list: 1,
          correct_count: 3,
          total_questions: 5,
          score_percentage: 60,
          teacher_comment: null,
          retake_status: 'none',
          pending_retake_request_id: null,
          can_authorize_retake: true,
          submitted_at: '2026-11-23T11:30:00Z',
        },
      ],
    });

    vi.spyOn(apiClient, 'authorizeStudentRetake').mockResolvedValue({
      id: 45,
      question_list_id: 5,
      question_list_title: 'Simulado 01 — Diagnóstico',
      classroom_id: null,
      classroom_name: null,
      organization_id: null,
      organization_name: null,
      is_standalone: true,
      student_id: 2,
      student_name: 'Lucas Silva',
      student_email: 'lucas@synapta.edu',
      attempts_used: 1,
      last_score_percentage: 60,
      status: 'approved',
      request_reason: null,
      created_at: '2026-11-23T12:00:00Z',
      reviewed_at: '2026-11-23T12:00:00Z',
    });

    renderTeacherRoute('/teacher/students/2');

    expect(await screen.findByRole('heading', { name: 'Lucas Silva' })).toBeInTheDocument();
    expect(screen.getByText('68,5%')).toBeInTheDocument();
    expect(screen.getByText('História do Brasil')).toBeInTheDocument();
    expect(screen.getByText('Biologia Celular e Genética')).toBeInTheDocument();
    expect(screen.getByText('Simulado Avulso')).toBeInTheDocument();
    expect(screen.getByText('Tentativa #1 de 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /liberar nova tentativa/i }));

    await waitFor(() => {
      expect(apiClient.authorizeStudentRetake).toHaveBeenCalledWith(5, 2);
    });
    expect(
      await screen.findByText(/nova tentativa liberada para lucas silva/i)
    ).toBeInTheDocument();
  });

  it('exibe "Sem entregas" na lista de alunos quando lists_completed_count é 0', async () => {
    vi.spyOn(apiClient, 'getTeacherOrganizations').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getTeacherClassrooms').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getTeacherLists').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getTeacherStudents').mockResolvedValue([
      {
        student_id: 3,
        name: 'Pedro Henrique',
        email: 'pedro@synapta.edu',
        classrooms: [{ id: 1, name: '2º Ano A — Ciências', visibility: 'public' }],
        lists_completed_count: 0,
        total_attempts_count: 0,
        standalone_submissions_count: 0,
        average_score_percentage: 0,
        last_submitted_at: null,
        has_pending_retake: false,
      },
    ]);

    renderTeacherRoute('/teacher/students');

    expect(await screen.findByText('Pedro Henrique')).toBeInTheDocument();
    expect(screen.getByText('Sem entregas')).toBeInTheDocument();
    expect(screen.queryByText('0,0%')).not.toBeInTheDocument();
  });

  it('congela criação de novas questões quando lista possui entregas e permite editar apenas enunciado e resolução', async () => {
    const user = userEvent.setup();

    vi.spyOn(apiClient, 'getTeacherClassrooms').mockResolvedValue([
      {
        id: 1,
        name: '2º Ano A — Ciências',
        description: null,
        organization_id: null,
        organization_name: null,
        visibility: 'public',
        access_code: null,
        student_count: 10,
        list_count: 1,
        created_at: '2026-11-20T10:00:00Z',
      },
    ]);
    vi.spyOn(apiClient, 'getTeacherListDetail').mockResolvedValue({
      id: 5,
      classroom_id: 1,
      classroom_name: '2º Ano A — Ciências',
      organization_id: null,
      organization_name: null,
      is_standalone: false,
      visibility: 'public',
      access_code: null,
      title: 'Simulado 01',
      description: 'Lista com submissões',
      is_published: true,
      question_count: 1,
      submission_count: 3,
      has_submissions: true,
      created_at: '2026-11-20T10:00:00Z',
      updated_at: '2026-11-20T10:00:00Z',
      questions: [
        {
          id: 101,
          question_list_id: 5,
          topic_id: 10,
          topic_name: 'Equações do 1º Grau',
          order_index: 1,
          statement: 'Resolva 2x = 8.',
          options: { A: '2', B: '3', C: '4', D: '5' },
          correct_option: 'C',
          explanation: 'Dividindo por 2 temos x = 4.',
        },
      ],
    });
    vi.spyOn(apiClient, 'getTopics').mockResolvedValue([
      { id: 10, name: 'Equações do 1º Grau', slug: 'equacoes-1-grau', description: null },
    ]);
    vi.spyOn(apiClient, 'updateQuestion').mockResolvedValue({
      id: 101,
      question_list_id: 5,
      topic_id: 10,
      topic_name: 'Equações do 1º Grau',
      order_index: 1,
      statement: 'Resolva 2x = 8 (revisado).',
      options: { A: '2', B: '3', C: '4', D: '5' },
      correct_option: 'C',
      explanation: 'Dividindo ambos os lados por 2 temos x = 4.',
    });

    renderTeacherRoute('/teacher/lists/5');

    const addBtn = await screen.findByRole('button', { name: /adicionar questão à lista/i });
    expect(addBtn).toBeDisabled();
    expect(
      screen.getByText(/não é possível adicionar novas questões porque a estrutura da lista está congelada/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^editar$/i }));

    expect(screen.getByLabelText(/assunto \/ matéria/i)).toBeDisabled();
    expect(screen.getByLabelText(/alternativa correta/i)).toBeDisabled();
    expect(screen.getByLabelText(/alternativa a/i)).toBeDisabled();

    const statementInput = screen.getByLabelText(/enunciado da questão/i);
    const explanationInput = screen.getByLabelText(/resolução comentada/i);
    expect(statementInput).toBeEnabled();
    expect(explanationInput).toBeEnabled();

    await user.clear(statementInput);
    await user.type(statementInput, 'Resolva 2x = 8 (revisado).');
    await user.clear(explanationInput);
    await user.type(explanationInput, 'Dividindo ambos os lados por 2 temos x = 4.');

    await user.click(screen.getByRole('button', { name: /atualizar questão/i }));

    await waitFor(() => {
      expect(apiClient.updateQuestion).toHaveBeenCalledWith(101, {
        statement: 'Resolva 2x = 8 (revisado).',
        explanation: 'Dividindo ambos os lados por 2 temos x = 4.',
      });
    });
  });

  it('não recarrega TeacherListEditorPage ao alterar o select de assunto no formulário de nova questão', async () => {
    const user = userEvent.setup();

    vi.spyOn(apiClient, 'getTeacherClassrooms').mockResolvedValue([]);
    const listSpy = vi.spyOn(apiClient, 'getTeacherListDetail').mockResolvedValue({
      id: 5,
      classroom_id: null,
      classroom_name: null,
      organization_id: null,
      organization_name: null,
      is_standalone: true,
      visibility: 'public',
      access_code: null,
      title: 'Simulado Avulso 01',
      description: null,
      is_published: false,
      question_count: 0,
      submission_count: 0,
      has_submissions: false,
      created_at: '2026-11-20T10:00:00Z',
      updated_at: '2026-11-20T10:00:00Z',
      questions: [],
    });
    const topicsSpy = vi.spyOn(apiClient, 'getTopics').mockResolvedValue([
      { id: 10, name: 'Biologia Celular', slug: 'biologia-celular', description: null },
      { id: 11, name: 'História do Brasil', slug: 'historia-do-brasil', description: null },
    ]);

    renderTeacherRoute('/teacher/lists/5');

    const topicSelect = await screen.findByLabelText(/assunto \/ matéria/i);
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(topicsSpy).toHaveBeenCalledTimes(1);

    await user.selectOptions(topicSelect, '11');

    expect((topicSelect as HTMLSelectElement).value).toBe('11');
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(topicsSpy).toHaveBeenCalledTimes(1);
  });

  it('permite alternar a tabela acessível de dados por assunto no gráfico de rendimento', async () => {
    const user = userEvent.setup();

    vi.spyOn(apiClient, 'getTeacherOrganizations').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getTeacherClassrooms').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getTeacherLists').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getRetakeRequests').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getTopicAnalytics').mockResolvedValue({
      kpis: {
        total_organizations: 0,
        total_classrooms: 1,
        total_students: 10,
        total_published_lists: 1,
        total_standalone_lists: 0,
        total_submissions: 5,
        overall_accuracy_percentage: 70,
        pending_retake_requests: 0,
      },
      topics: [
        {
          topic_id: 10,
          topic_name: 'Interpretação de Texto',
          total_answers: 10,
          correct_answers: 7,
          wrong_answers: 3,
          accuracy_percentage: 70,
        },
      ],
      lowest_performing_topics: [],
      highest_performing_topics: [],
      standalone_lists: [],
    });

    renderTeacherRoute('/teacher/dashboard');

    const toggleBtn = await screen.findByRole('button', { name: /ver dados em tabela/i });
    await user.click(toggleBtn);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Interpretação de Texto')).toBeInTheDocument();
    expect(screen.getByText('7/10')).toBeInTheDocument();
    expect(screen.getByText('Em evolução')).toBeInTheDocument();
  });
});

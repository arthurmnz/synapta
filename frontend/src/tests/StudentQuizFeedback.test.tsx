import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { AuthProvider } from '../contexts/AuthContext';
import { apiClient, setStoredToken } from '../lib/apiClient';
import type { SubmissionFeedbackOut } from '../types/api';

const STUDENT_USER = {
  id: 2,
  name: 'Lucas Silva',
  email: 'lucas@synapta.edu',
  role: 'student' as const,
  created_at: '2026-11-23T10:00:00Z',
};

const SUBMISSION_FEEDBACK: SubmissionFeedbackOut = {
  submission_id: 77,
  question_list_id: 5,
  question_list_title: 'Simulado 01 — Equações e Frações',
  classroom_id: 1,
  classroom_name: '9º Ano A — Matemática',
  student_id: 2,
  student_name: 'Lucas Silva',
  student_email: 'lucas@synapta.edu',
  attempt_number: 1,
  attempts_used_total: 1,
  correct_count: 1,
  total_questions: 2,
  score_percentage: 50,
  performance_band: 'average',
  teacher_comment: 'Bom começo em frações. Revise o isolamento de x nas equações.',
  teacher_commented_at: '2026-11-23T12:00:00Z',
  retake_status: 'none',
  pending_retake_request_id: null,
  can_authorize_retake: true,
  can_attempt: false,
  submitted_at: '2026-11-23T11:30:00Z',
  topic_breakdown: [
    {
      topic_id: 10,
      topic_name: 'Equações do 1º Grau',
      total_answers: 1,
      correct_answers: 0,
      wrong_answers: 1,
      accuracy_percentage: 0,
    },
    {
      topic_id: 11,
      topic_name: 'Frações',
      total_answers: 1,
      correct_answers: 1,
      wrong_answers: 0,
      accuracy_percentage: 100,
    },
  ],
  questions_feedback: [
    {
      question_id: 101,
      order_index: 1,
      topic_id: 10,
      topic_name: 'Equações do 1º Grau',
      statement: 'Resolva 2x + 4 = 10.',
      options: { A: '2', B: '3', C: '4', D: '5' },
      selected_option: 'C',
      correct_option: 'B',
      is_correct: false,
      explanation: '2x = 6, logo x = 3.',
    },
    {
      question_id: 102,
      order_index: 2,
      topic_id: 11,
      topic_name: 'Frações',
      statement: 'Quanto é 1/2 + 1/4?',
      options: { A: '2/4', B: '2/6', C: '3/4', D: '1/4' },
      selected_option: 'C',
      correct_option: 'C',
      is_correct: true,
      explanation: '1/2 = 2/4, portanto 2/4 + 1/4 = 3/4.',
    },
  ],
};

function renderStudentRoute(route: string) {
  setStoredToken('student-token');
  vi.spyOn(apiClient, 'me').mockResolvedValue(STUDENT_USER);
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('StudentQuizFeedback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('permite ao aluno entrar em uma turma disponível', async () => {
    const user = userEvent.setup();

    vi.spyOn(apiClient, 'getStudentClassrooms')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 1,
          name: '9º Ano A — Matemática',
          description: 'Turma regular',
          teacher_name: 'Ana Paula',
          published_lists_count: 2,
          enrolled_at: '2026-11-23T10:00:00Z',
        },
      ]);
    vi.spyOn(apiClient, 'getAvailableClassrooms')
      .mockResolvedValueOnce([
        {
          id: 1,
          name: '9º Ano A — Matemática',
          description: 'Turma regular',
          teacher_name: 'Ana Paula',
          student_count: 12,
          published_lists_count: 2,
          is_enrolled: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 1,
          name: '9º Ano A — Matemática',
          description: 'Turma regular',
          teacher_name: 'Ana Paula',
          student_count: 13,
          published_lists_count: 2,
          is_enrolled: true,
        },
      ]);
    vi.spyOn(apiClient, 'enrollInClassroom').mockResolvedValue({
      classroom_id: 1,
      student_id: 2,
      enrolled_at: '2026-11-23T12:00:00Z',
    });

    renderStudentRoute('/student/classrooms');

    const enrollBtn = await screen.findByRole('button', { name: /entrar na turma/i });
    await user.click(enrollBtn);

    await waitFor(() => {
      expect(apiClient.enrollInClassroom).toHaveBeenCalledWith(1);
    });
    expect(await screen.findByText(/matrícula realizada na turma/i)).toBeInTheDocument();
  });

  it('exibe questões A-D, envia respostas e mostra feedback determinístico + comentário do professor', async () => {
    const user = userEvent.setup();

    vi.spyOn(apiClient, 'getStudentListDetail').mockResolvedValue({
      id: 5,
      classroom_id: 1,
      classroom_name: '9º Ano A — Matemática',
      teacher_name: 'Ana Paula',
      title: 'Simulado 01 — Equações e Frações',
      description: 'Avaliação diagnóstica inicial.',
      attempts_used: 0,
      next_attempt_number: 1,
      can_attempt: true,
      retake_status: 'none',
      questions: [
        {
          id: 101,
          order_index: 1,
          topic_id: 10,
          topic_name: 'Equações do 1º Grau',
          statement: 'Resolva 2x + 4 = 10.',
          options: { A: '2', B: '3', C: '4', D: '5' },
        },
        {
          id: 102,
          order_index: 2,
          topic_id: 11,
          topic_name: 'Frações',
          statement: 'Quanto é 1/2 + 1/4?',
          options: { A: '2/4', B: '2/6', C: '3/4', D: '1/4' },
        },
      ],
      past_submissions: [],
    });
    vi.spyOn(apiClient, 'submitQuiz').mockResolvedValue(SUBMISSION_FEEDBACK);
    vi.spyOn(apiClient, 'getStudentSubmissionDetail').mockResolvedValue(SUBMISSION_FEEDBACK);

    renderStudentRoute('/student/lists/5');

    expect(await screen.findByText(/tentativa #1/i)).toBeInTheDocument();
    expect(screen.getByText('Resolva 2x + 4 = 10.')).toBeInTheDocument();

    // Mark option C on question 1 and option C on question 2
    const radioGroups = screen.getAllByRole('radiogroup');
    expect(radioGroups).toHaveLength(2);

    await user.click(screen.getByText('4'));
    await user.click(screen.getByText('3/4'));
    await user.click(screen.getByRole('button', { name: /enviar simulado completo/i }));

    await waitFor(() => {
      expect(apiClient.submitQuiz).toHaveBeenCalledWith('5', {
        answers: [
          { question_id: 101, selected_option: 'C' },
          { question_id: 102, selected_option: 'C' },
        ],
      });
    });

    await waitFor(() => {
      expect(
        screen.getByText('Bom começo em frações. Revise o isolamento de x nas equações.')
      ).toBeInTheDocument();
    });
    expect(screen.getByText('2x = 6, logo x = 3.')).toBeInTheDocument();
  });

  it('permite solicitar nova tentativa ao professor quando can_attempt é false', async () => {
    const user = userEvent.setup();

    vi.spyOn(apiClient, 'getStudentListDetail')
      .mockResolvedValueOnce({
        id: 5,
        classroom_id: 1,
        classroom_name: '9º Ano A — Matemática',
        teacher_name: 'Ana Paula',
        title: 'Simulado 01 — Equações e Frações',
        description: null,
        attempts_used: 1,
        next_attempt_number: 2,
        can_attempt: false,
        retake_status: 'none',
        questions: [],
        past_submissions: [
          {
            submission_id: 77,
            attempt_number: 1,
            score_percentage: 50,
            correct_count: 1,
            total_questions: 2,
            has_teacher_comment: true,
            submitted_at: '2026-11-23T11:30:00Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 5,
        classroom_id: 1,
        classroom_name: '9º Ano A — Matemática',
        teacher_name: 'Ana Paula',
        title: 'Simulado 01 — Equações e Frações',
        description: null,
        attempts_used: 1,
        next_attempt_number: 2,
        can_attempt: false,
        retake_status: 'pending',
        questions: [],
        past_submissions: [
          {
            submission_id: 77,
            attempt_number: 1,
            score_percentage: 50,
            correct_count: 1,
            total_questions: 2,
            has_teacher_comment: true,
            submitted_at: '2026-11-23T11:30:00Z',
          },
        ],
      });

    vi.spyOn(apiClient, 'requestRetake').mockResolvedValue({
      id: 9,
      question_list_id: 5,
      question_list_title: 'Simulado 01 — Equações e Frações',
      classroom_id: 1,
      classroom_name: '9º Ano A — Matemática',
      student_id: 2,
      student_name: 'Lucas Silva',
      student_email: 'lucas@synapta.edu',
      attempts_used: 1,
      last_score_percentage: 50,
      status: 'pending',
      request_reason: 'Revisei o conteúdo',
      created_at: '2026-11-23T12:10:00Z',
      reviewed_at: null,
    });

    renderStudentRoute('/student/lists/5');

    const reasonInput = await screen.findByPlaceholderText(/revise os tópicos/i);
    await user.type(reasonInput, 'Revisei o conteúdo');
    await user.click(screen.getByRole('button', { name: /solicitar nova tentativa/i }));

    await waitFor(() => {
      expect(apiClient.requestRetake).toHaveBeenCalledWith('5', 'Revisei o conteúdo');
    });
    expect(await screen.findByText(/solicitação pendente/i)).toBeInTheDocument();
  });
});

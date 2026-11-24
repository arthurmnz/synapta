import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { AuthProvider } from '../contexts/AuthContext';
import { ApiError, apiClient, setStoredToken } from '../lib/apiClient';

function renderAsRole(role: 'student' | 'teacher', route: string) {
  setStoredToken(`${role}-token`);
  vi.spyOn(apiClient, 'me').mockResolvedValue({
    id: role === 'teacher' ? 1 : 2,
    name: role === 'teacher' ? 'Ana Paula' : 'Lucas Silva',
    email: role === 'teacher' ? 'ana.paula@synapta.edu' : 'lucas@synapta.edu',
    role,
    created_at: '2026-11-23T10:00:00Z',
  });
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('HierarchyAndAccessCodes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('permite ao professor criar organização privada e colaborar em organização de outro docente via código', async () => {
    const user = userEvent.setup();

    vi.spyOn(apiClient, 'getTeacherOrganizations')
      .mockResolvedValueOnce([
        {
          id: 'org-2',
          name: 'Colégio Vértice',
          description: 'Instituição privada',
          visibility: 'private',
          is_owner: false,
          is_member: false,
          access_code: null,
          owner_id: 99,
          owner_name: 'Carlos Mendes',
          teacher_count: 1,
          classroom_count: 2,
          student_count: 10,
          created_at: '2026-11-20T10:00:00Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'org-1',
          name: 'Rede Sinapse',
          description: 'Ensino multidisciplinar',
          visibility: 'private',
          is_owner: true,
          is_member: true,
          access_code: 'SINAPSE26',
          owner_id: 1,
          owner_name: 'Ana Paula',
          teacher_count: 1,
          classroom_count: 0,
          student_count: 0,
          created_at: '2026-11-23T10:00:00Z',
        },
        {
          id: 'org-2',
          name: 'Colégio Vértice',
          description: 'Instituição privada',
          visibility: 'private',
          is_owner: false,
          is_member: false,
          access_code: null,
          owner_id: 99,
          owner_name: 'Carlos Mendes',
          teacher_count: 1,
          classroom_count: 2,
          student_count: 10,
          created_at: '2026-11-20T10:00:00Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'org-1',
          name: 'Rede Sinapse',
          description: 'Ensino multidisciplinar',
          visibility: 'private',
          is_owner: true,
          is_member: true,
          access_code: 'SINAPSE26',
          owner_id: 1,
          owner_name: 'Ana Paula',
          teacher_count: 1,
          classroom_count: 0,
          student_count: 0,
          created_at: '2026-11-23T10:00:00Z',
        },
        {
          id: 'org-2',
          name: 'Colégio Vértice',
          description: 'Instituição privada',
          visibility: 'private',
          is_owner: false,
          is_member: true,
          access_code: null,
          owner_id: 99,
          owner_name: 'Carlos Mendes',
          teacher_count: 2,
          classroom_count: 2,
          student_count: 10,
          created_at: '2026-11-20T10:00:00Z',
        },
      ]);

    const createOrgSpy = vi.spyOn(apiClient, 'createTeacherOrganization').mockResolvedValue({
      id: 'org-1',
      name: 'Rede Sinapse',
      description: 'Ensino multidisciplinar',
      visibility: 'private',
      is_owner: true,
      is_member: true,
      access_code: 'SINAPSE26',
      owner_id: 1,
      owner_name: 'Ana Paula',
      teacher_count: 1,
      classroom_count: 0,
      student_count: 0,
      created_at: '2026-11-23T10:00:00Z',
    });

    const joinOrgSpy = vi.spyOn(apiClient, 'joinTeacherOrganization').mockResolvedValue({
      organization_id: 'org-2',
      user_id: 1,
      member_role: 'teacher',
      joined_at: '2026-11-23T12:00:00Z',
    });

    renderAsRole('teacher', '/teacher/organizations');

    await user.click(await screen.findByRole('button', { name: /nova organização/i }));
    await user.type(screen.getByLabelText(/nome da organização/i), 'Rede Sinapse');
    await user.click(screen.getByRole('radio', { name: /privada/i }));
    await user.type(screen.getByLabelText(/código de acesso da organização/i), 'SINAPSE26');
    await user.click(screen.getByRole('button', { name: /criar organização/i }));

    await waitFor(() => {
      expect(createOrgSpy).toHaveBeenCalledWith({
        name: 'Rede Sinapse',
        description: null,
        visibility: 'private',
        access_code: 'SINAPSE26',
      });
    });

    expect(await screen.findByText('SINAPSE26')).toBeInTheDocument();

    // Now join Colégio Vértice via AccessCodeModal
    await user.click(screen.getByRole('button', { name: /ingressar com código/i }));
    expect(
      await screen.findByRole('dialog', { name: /desbloquear organização privada/i })
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^código de acesso$/i), 'VERTICE26');
    await user.click(screen.getByRole('button', { name: /desbloquear e ingressar/i }));

    await waitFor(() => {
      expect(joinOrgSpy).toHaveBeenCalledWith('org-2', 'VERTICE26');
    });
    expect(await screen.findByText(/^colaborador$/i)).toBeInTheDocument();
  });

  it('permite ao professor criar Simulado Avulso mesmo sem turmas cadastradas', async () => {
    const user = userEvent.setup();

    vi.spyOn(apiClient, 'getTeacherOrganizations').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getTeacherClassrooms').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getTeacherLists').mockResolvedValue([]);
    const createListSpy = vi.spyOn(apiClient, 'createList').mockResolvedValue({
      id: 'standalone-1',
      classroom_id: null,
      classroom_name: null,
      organization_id: null,
      organization_name: null,
      is_standalone: true,
      visibility: 'public',
      access_code: null,
      title: 'Simulado Nacional Aberto',
      description: 'Multidisciplinar',
      is_published: false,
      question_count: 0,
      submission_count: 0,
      has_submissions: false,
      created_at: '2026-11-23T12:00:00Z',
      updated_at: '2026-11-23T12:00:00Z',
      questions: [],
    });
    vi.spyOn(apiClient, 'getTeacherListDetail').mockResolvedValue({
      id: 'standalone-1',
      classroom_id: null,
      classroom_name: null,
      organization_id: null,
      organization_name: null,
      is_standalone: true,
      visibility: 'public',
      access_code: null,
      title: 'Simulado Nacional Aberto',
      description: 'Multidisciplinar',
      is_published: false,
      question_count: 0,
      submission_count: 0,
      has_submissions: false,
      created_at: '2026-11-23T12:00:00Z',
      updated_at: '2026-11-23T12:00:00Z',
      questions: [],
    });
    vi.spyOn(apiClient, 'getTopics').mockResolvedValue([]);

    renderAsRole('teacher', '/teacher/classrooms');

    const newSimBtn = await screen.findByRole('button', { name: /novo simulado/i });
    expect(newSimBtn).toBeEnabled();
    await user.click(newSimBtn);

    await user.type(screen.getByLabelText(/título do simulado/i), 'Simulado Nacional Aberto');
    await user.type(screen.getByLabelText(/orientações para os alunos/i), 'Multidisciplinar');
    await user.click(screen.getByRole('button', { name: /criar e adicionar questões/i }));

    await waitFor(() => {
      expect(createListSpy).toHaveBeenCalledWith({
        is_standalone: true,
        title: 'Simulado Nacional Aberto',
        description: 'Multidisciplinar',
        visibility: 'public',
      });
    });

    const standaloneRadio = await screen.findByRole('radio', { name: /simulado avulso/i });
    expect(standaloneRadio).toBeChecked();
    expect(screen.getAllByText('Simulado Avulso').length).toBeGreaterThanOrEqual(1);
  });

  it('permite ao aluno desbloquear organização privada e visualizar suas turmas', async () => {
    const user = userEvent.setup();

    vi.spyOn(apiClient, 'getStudentOrganizations')
      .mockResolvedValueOnce([
        {
          id: 'org-priv',
          name: 'Colégio Vértice',
          description: 'Preparatório',
          owner_name: 'Carlos Mendes',
          visibility: 'private',
          is_member: false,
          public_classroom_count: 1,
          total_classroom_count: 2,
          joined_at: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'org-priv',
          name: 'Colégio Vértice',
          description: 'Preparatório',
          owner_name: 'Carlos Mendes',
          visibility: 'private',
          is_member: true,
          public_classroom_count: 1,
          total_classroom_count: 2,
          joined_at: '2026-11-23T12:00:00Z',
        },
      ]);

    const joinSpy = vi.spyOn(apiClient, 'joinStudentOrganization').mockResolvedValue({
      organization_id: 'org-priv',
      user_id: 2,
      member_role: 'student',
      joined_at: '2026-11-23T12:00:00Z',
    });

    vi.spyOn(apiClient, 'getStudentOrganizationClassrooms').mockResolvedValue([
      {
        id: 'cls-priv',
        name: 'Preparatório Avançado Vértice',
        description: 'Turma privada',
        organization_id: 'org-priv',
        organization_name: 'Colégio Vértice',
        organization_visibility: 'private',
        visibility: 'private',
        teacher_name: 'Carlos Mendes',
        student_count: 5,
        published_lists_count: 1,
        is_enrolled: false,
      },
    ]);

    const enrollSpy = vi.spyOn(apiClient, 'enrollInClassroom').mockResolvedValue({
      classroom_id: 'cls-priv',
      student_id: 2,
      enrolled_at: '2026-11-23T12:05:00Z',
    });

    renderAsRole('student', '/student/organizations');

    await user.click(await screen.findByRole('button', { name: /desbloquear organização/i }));
    await user.type(screen.getByLabelText(/^código de acesso$/i), 'VERTICE26');
    await user.click(screen.getByRole('button', { name: /desbloquear e ingressar/i }));

    await waitFor(() => {
      expect(joinSpy).toHaveBeenCalledWith('org-priv', 'VERTICE26');
    });

    // Now the organization classrooms panel opens showing the private classroom with lock
    expect(await screen.findByText('Preparatório Avançado Vértice')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /entrar com código/i }));
    await user.type(screen.getByLabelText(/^código de acesso$/i), 'PREP2026');
    await user.click(screen.getByRole('button', { name: /confirmar matrícula/i }));

    await waitFor(() => {
      expect(enrollSpy).toHaveBeenCalledWith('cls-priv', 'PREP2026');
    });
  });

  it('exibe Simulados Avulsos e permite desbloquear simulado privado permanente no painel do aluno', async () => {
    const user = userEvent.setup();

    vi.spyOn(apiClient, 'getStudentOrganizations').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getStudentClassrooms').mockResolvedValue([
      {
        id: 'cls-1',
        name: 'Biologia & Física',
        description: null,
        organization_id: 'org-1',
        organization_name: 'Instituto Horizonte',
        organization_visibility: 'public',
        visibility: 'public',
        teacher_name: 'Carlos Mendes',
        published_lists_count: 1,
        enrolled_at: '2026-11-20T10:00:00Z',
      },
    ]);
    vi.spyOn(apiClient, 'getStudentLists')
      .mockResolvedValueOnce([
        {
          id: 'list-priv',
          classroom_id: 'cls-1',
          classroom_name: 'Biologia & Física',
          organization_id: 'org-1',
          organization_name: 'Instituto Horizonte',
          is_standalone: false,
          visibility: 'private',
          is_unlocked: false,
          teacher_name: 'Carlos Mendes',
          title: 'Desafio Privado de Genética',
          description: 'Exige código',
          question_count: 3,
          attempts_used: 0,
          max_attempts_available_now: 1,
          can_attempt: true,
          retake_status: 'none',
          latest_submission_id: null,
          latest_score_percentage: null,
        },
        {
          id: 'list-standalone',
          classroom_id: null,
          classroom_name: null,
          organization_id: null,
          organization_name: null,
          is_standalone: true,
          visibility: 'public',
          is_unlocked: true,
          teacher_name: 'Ana Paula',
          title: 'Simulado Avulso de Atualidades',
          description: 'Aberto a todos',
          question_count: 5,
          attempts_used: 0,
          max_attempts_available_now: 1,
          can_attempt: true,
          retake_status: 'none',
          latest_submission_id: null,
          latest_score_percentage: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'list-priv',
          classroom_id: 'cls-1',
          classroom_name: 'Biologia & Física',
          organization_id: 'org-1',
          organization_name: 'Instituto Horizonte',
          is_standalone: false,
          visibility: 'private',
          is_unlocked: true,
          teacher_name: 'Carlos Mendes',
          title: 'Desafio Privado de Genética',
          description: 'Exige código',
          question_count: 3,
          attempts_used: 0,
          max_attempts_available_now: 1,
          can_attempt: true,
          retake_status: 'none',
          latest_submission_id: null,
          latest_score_percentage: null,
        },
        {
          id: 'list-standalone',
          classroom_id: null,
          classroom_name: null,
          organization_id: null,
          organization_name: null,
          is_standalone: true,
          visibility: 'public',
          is_unlocked: true,
          teacher_name: 'Ana Paula',
          title: 'Simulado Avulso de Atualidades',
          description: 'Aberto a todos',
          question_count: 5,
          attempts_used: 0,
          max_attempts_available_now: 1,
          can_attempt: true,
          retake_status: 'none',
          latest_submission_id: null,
          latest_score_percentage: null,
        },
      ]);

    const unlockSpy = vi.spyOn(apiClient, 'unlockStudentList').mockResolvedValue({
      id: 'list-priv',
      classroom_id: 'cls-1',
      classroom_name: 'Biologia & Física',
      organization_id: 'org-1',
      organization_name: 'Instituto Horizonte',
      is_standalone: false,
      visibility: 'private',
      is_unlocked: true,
      teacher_name: 'Carlos Mendes',
      title: 'Desafio Privado de Genética',
      description: 'Exige código',
      attempts_used: 0,
      next_attempt_number: 1,
      can_attempt: true,
      retake_status: 'none',
      questions: [],
      past_submissions: [],
    });

    renderAsRole('student', '/student/dashboard');

    expect(await screen.findByText('Desafio Privado de Genética')).toBeInTheDocument();
    expect(screen.getByText('Simulado Avulso de Atualidades')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /desbloquear com código/i }));
    await user.type(screen.getByLabelText(/^código de acesso$/i), 'DESAFIO26');
    await user.click(screen.getByRole('button', { name: /desbloquear simulado/i }));

    await waitFor(() => {
      expect(unlockSpy).toHaveBeenCalledWith('list-priv', 'DESAFIO26');
    });
    expect(await screen.findByText(/desbloqueado permanentemente/i)).toBeInTheDocument();
  });

  it('trata 403 LIST_LOCKED ao acessar URL direta do simulado privado e permite desbloquear ali mesmo', async () => {
    const user = userEvent.setup();

    vi.spyOn(apiClient, 'getStudentListDetail').mockRejectedValue(
      new ApiError(
        'Este simulado é privado. Insira o código de acesso para desbloquear as questões.',
        403,
        { detail: '...', code: 'LIST_LOCKED' },
        'LIST_LOCKED'
      )
    );
    const unlockSpy = vi.spyOn(apiClient, 'unlockStudentList').mockResolvedValue({
      id: 'list-priv',
      classroom_id: 'cls-1',
      classroom_name: 'Biologia & Física',
      organization_id: null,
      organization_name: null,
      is_standalone: false,
      visibility: 'private',
      is_unlocked: true,
      teacher_name: 'Carlos Mendes',
      title: 'Desafio Privado de Genética',
      description: null,
      attempts_used: 0,
      next_attempt_number: 1,
      can_attempt: true,
      retake_status: 'none',
      questions: [
        {
          id: 'q1',
          order_index: 1,
          topic_id: 't1',
          topic_name: 'Biologia Celular',
          statement: 'Qual a função dos ribossomos?',
          options: {
            A: 'Síntese de proteínas',
            B: 'Digestão celular',
            C: 'Fotossíntese',
            D: 'Transporte passivo',
          },
        },
      ],
      past_submissions: [],
    });

    renderAsRole('student', '/student/lists/list-priv');

    expect(
      await screen.findByRole('heading', { name: /simulado privado bloqueado/i })
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/código de acesso do simulado/i), 'DESAFIO26');
    await user.click(screen.getByRole('button', { name: /desbloquear simulado/i }));

    await waitFor(() => {
      expect(unlockSpy).toHaveBeenCalledWith('list-priv', 'DESAFIO26');
    });
    expect(await screen.findByText('Qual a função dos ribossomos?')).toBeInTheDocument();
  });

  it('exibe "Simulado Avulso" no histórico do aluno quando classroom_name é null', async () => {
    vi.spyOn(apiClient, 'getStudentSubmissions').mockResolvedValue([
      {
        submission_id: 'sub-1',
        question_list_id: 'list-standalone',
        question_list_title: 'Simulado Aberto de Humanidades',
        classroom_id: null,
        classroom_name: null,
        organization_id: null,
        organization_name: null,
        is_standalone: true,
        attempt_number: 1,
        attempts_used_total: 1,
        correct_count: 4,
        total_questions: 5,
        score_percentage: 80,
        performance_band: 'good',
        has_teacher_comment: false,
        retake_status: 'none',
        can_attempt: false,
        submitted_at: '2026-11-23T12:00:00Z',
      },
    ]);

    renderAsRole('student', '/student/history');

    expect(await screen.findByText('Simulado Aberto de Humanidades')).toBeInTheDocument();
    expect(screen.getByText('Simulado Avulso')).toBeInTheDocument();
  });
});

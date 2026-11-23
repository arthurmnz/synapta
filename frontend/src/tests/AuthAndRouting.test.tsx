import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { AuthProvider } from '../contexts/AuthContext';
import { apiClient, setStoredToken } from '../lib/apiClient';

function renderWithRoute(initialRoute: string) {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('AuthAndRouting', () => {
  beforeEach(() => {
    setStoredToken(null);
    vi.restoreAllMocks();
  });

  it('redireciona visitante não autenticado para /login ao acessar rota protegida', async () => {
    renderWithRoute('/student/dashboard');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /entrar na plataforma/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/acesso rápido \(demo\)/i)).toBeInTheDocument();
  });

  it('permite login via Acesso Rápido (Demo) de professor e redireciona para /teacher/dashboard', async () => {
    const user = userEvent.setup();

    vi.spyOn(apiClient, 'login').mockResolvedValue({
      access_token: 'teacher-jwt-token',
      token_type: 'bearer',
      user: {
        id: 1,
        name: 'Ana Paula',
        email: 'ana.paula@synapta.edu',
        role: 'teacher',
        created_at: '2026-11-23T10:00:00Z',
      },
    });
    vi.spyOn(apiClient, 'getTeacherClassrooms').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getTeacherLists').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getRetakeRequests').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getTopicAnalytics').mockResolvedValue({
      kpis: {
        total_classrooms: 2,
        total_students: 4,
        total_published_lists: 3,
        total_submissions: 10,
        overall_accuracy_percentage: 72.5,
        pending_retake_requests: 0,
      },
      topics: [],
      lowest_performing_topics: [],
      highest_performing_topics: [],
    });

    renderWithRoute('/login');

    const demoBtn = await screen.findByRole('button', { name: /professora ana paula/i });
    await user.click(demoBtn);

    await waitFor(() => {
      expect(apiClient.login).toHaveBeenCalledWith({
        email: 'ana.paula@synapta.edu',
        password: 'Professor123!',
      });
    });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /visão analítica de matemática/i })
      ).toBeInTheDocument();
    });
  });

  it('bloqueia acesso de aluno às rotas de professor e redireciona para /student/dashboard', async () => {
    setStoredToken('student-jwt-token');
    vi.spyOn(apiClient, 'me').mockResolvedValue({
      id: 2,
      name: 'Lucas Silva',
      email: 'lucas@synapta.edu',
      role: 'student',
      created_at: '2026-11-23T10:00:00Z',
    });
    vi.spyOn(apiClient, 'getStudentClassrooms').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getStudentLists').mockResolvedValue([]);

    renderWithRoute('/teacher/dashboard');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /olá, lucas/i })).toBeInTheDocument();
    });
  });

  it('permite cadastrar novo aluno na página de registro', async () => {
    const user = userEvent.setup();

    vi.spyOn(apiClient, 'register').mockResolvedValue({
      access_token: 'new-student-token',
      token_type: 'bearer',
      user: {
        id: 10,
        name: 'Beatriz Almeida',
        email: 'beatriz@escola.edu',
        role: 'student',
        created_at: '2026-11-23T11:00:00Z',
      },
    });
    vi.spyOn(apiClient, 'getStudentClassrooms').mockResolvedValue([]);
    vi.spyOn(apiClient, 'getStudentLists').mockResolvedValue([]);

    renderWithRoute('/register');

    await user.type(screen.getByLabelText(/nome completo/i), 'Beatriz Almeida');
    await user.type(screen.getByLabelText(/e-mail/i), 'beatriz@escola.edu');
    await user.type(screen.getByLabelText(/^senha$/i), 'Senha123!');
    await user.type(screen.getByLabelText(/confirmar senha/i), 'Senha123!');

    await user.click(screen.getByRole('button', { name: /cadastrar como aluno/i }));

    await waitFor(() => {
      expect(apiClient.register).toHaveBeenCalledWith({
        name: 'Beatriz Almeida',
        email: 'beatriz@escola.edu',
        password: 'Senha123!',
        role: 'student',
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /olá, beatriz/i })).toBeInTheDocument();
    });
  });

  it('oculta bloco Acesso Rápido (Demo) quando VITE_ENABLE_DEMO_LOGIN é false', async () => {
    vi.stubEnv('VITE_ENABLE_DEMO_LOGIN', 'false');
    renderWithRoute('/login');

    expect(
      await screen.findByRole('heading', { name: /entrar na plataforma/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/acesso rápido \(demo\)/i)).not.toBeInTheDocument();
  });

  it('oculta bloco Acesso Rápido (Demo) quando SEED_ON_START é false', async () => {
    vi.stubEnv('SEED_ON_START', 'false');
    const healthSpy = vi.spyOn(apiClient, 'get');
    renderWithRoute('/login');

    expect(
      await screen.findByRole('heading', { name: /entrar na plataforma/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/acesso rápido \(demo\)/i)).not.toBeInTheDocument();
    expect(healthSpy).not.toHaveBeenCalled();
  });

  it('oculta bloco Acesso Rápido (Demo) quando GET /health retorna demo_mode: false', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      status: 'ok',
      database: 'ok',
      demo_mode: false,
    });

    renderWithRoute('/login');

    expect(
      await screen.findByRole('heading', { name: /entrar na plataforma/i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/health', { skipAuth: true });
      expect(screen.queryByText(/acesso rápido \(demo\)/i)).not.toBeInTheDocument();
    });
  });
});

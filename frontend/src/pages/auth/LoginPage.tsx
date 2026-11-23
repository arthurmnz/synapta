import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, GraduationCap, ShieldCheck, UserCheck } from 'lucide-react';
import { Alert, Button, Card } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient, ApiError } from '../../lib/apiClient';
import type { UserRole } from '../../types/api';

interface DemoAccount {
  label: string;
  roleLabel: string;
  role: UserRole;
  email: string;
  password: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: 'Professora Ana Paula',
    roleLabel: 'Professor',
    role: 'teacher',
    email: 'ana.paula@synapta.edu',
    password: 'Professor123!',
  },
  {
    label: 'Lucas Silva',
    roleLabel: 'Aluno',
    role: 'student',
    email: 'lucas@synapta.edu',
    password: 'Aluno123!',
  },
  {
    label: 'Mariana Costa',
    roleLabel: 'Aluno',
    role: 'student',
    email: 'mariana@synapta.edu',
    password: 'Aluno123!',
  },
  {
    label: 'Gabriel Rocha',
    roleLabel: 'Aluno',
    role: 'student',
    email: 'gabriel@synapta.edu',
    password: 'Aluno123!',
  },
  {
    label: 'Pedro Henrique',
    roleLabel: 'Aluno',
    role: 'student',
    email: 'pedro@synapta.edu',
    password: 'Aluno123!',
  },
];

export function LoginPage() {
  const { login, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const envDemoDisabled =
    import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'false' ||
    String(import.meta.env.SEED_ON_START ?? '').toLowerCase() === 'false';

  const [runtimeDemoEnabled, setRuntimeDemoEnabled] = useState<boolean>(!envDemoDisabled);
  const isDemoLoginEnabled = !envDemoDisabled && runtimeDemoEnabled;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoLoadingEmail, setDemoLoadingEmail] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard', {
        replace: true,
      });
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    if (envDemoDisabled) {
      return;
    }

    let active = true;
    apiClient
      .get<{ status: string; database: string; demo_mode?: boolean }>('/health', {
        skipAuth: true,
      })
      .then((data) => {
        if (active && data && data.demo_mode === false) {
          setRuntimeDemoEnabled(false);
        }
      })
      .catch(() => {
        // Keep demo card visible when /health is unavailable or not mocked
      });

    return () => {
      active = false;
    };
  }, [envDemoDisabled]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Informe seu e-mail e sua senha para entrar.');
      return;
    }

    setSubmitting(true);
    try {
      const loggedUser = await login({ email: email.trim(), password });
      navigate(loggedUser.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard', {
        replace: true,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível entrar. Verifique suas credenciais e tente novamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async (account: DemoAccount) => {
    if (!isDemoLoginEnabled) return;
    setError(null);
    setEmail(account.email);
    setDemoLoadingEmail(account.email);

    try {
      const loggedUser = await login({ email: account.email, password: account.password });
      navigate(loggedUser.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard', {
        replace: true,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Não foi possível acessar a conta demo (${account.email}).`
      );
    } finally {
      setDemoLoadingEmail(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F8F5] flex flex-col lg:flex-row">
      {/* Cartesian Drafting-Grid Authority Column */}
      <div className="bg-math-grid-dark text-white lg:w-[44%] xl:w-[42%] px-6 py-10 sm:px-10 lg:px-12 lg:py-14 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
        <div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-[#1B4FD8] text-white">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 18L10 6L15 14L20 6" />
                  <circle cx="20" cy="6" r="1.5" fill="currentColor" />
                  <path d="M4 20H20" />
                </svg>
              </div>
              <div>
                <span className="font-display text-xl font-bold tracking-tight text-white">
                  Synapta
                </span>
                <span className="block text-xs font-medium text-slate-300">
                  Educação em Matemática
                </span>
              </div>
            </div>

            <span className="hidden sm:inline-block font-mono text-[11px] text-blue-200/80 border border-white/15 rounded px-2 py-0.5 bg-white/5">
              f(x) · Δ &ge; 0
            </span>
          </div>

          <div className="mt-10 lg:mt-16 max-w-md">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white leading-[1.15]">
              Simulados de Matemática com diagnóstico preciso por assunto.
            </h1>
            <p className="mt-4 text-sm sm:text-base leading-relaxed text-slate-300">
              Alunos escolhem suas turmas, resolvem questões de múltipla escolha e recebem gabarito
              comentado pelo professor. Docentes acompanham o rendimento por conteúdo e controlam
              novas tentativas.
            </p>
          </div>

          {/* Subtle mathematical coordinate sketch */}
          <div className="mt-8 hidden sm:block max-w-md rounded-lg border border-white/10 bg-[#0F1627]/70 p-4">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 mb-2">
              <span>Diagnóstico por assunto</span>
              <span className="text-emerald-300">Domínio &ge; 75%</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-xs">
                <span className="w-28 truncate text-slate-300">Frações</span>
                <div className="flex-1 h-1.5 rounded-sm bg-white/10 overflow-hidden">
                  <div className="h-full w-[88%] bg-emerald-400" />
                </div>
                <span className="font-mono text-[11px] text-emerald-300 tabular-nums">88%</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="w-28 truncate text-slate-300">Geometria</span>
                <div className="flex-1 h-1.5 rounded-sm bg-white/10 overflow-hidden">
                  <div className="h-full w-[64%] bg-amber-400" />
                </div>
                <span className="font-mono text-[11px] text-amber-300 tabular-nums">64%</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="w-28 truncate text-slate-300">Equações</span>
                <div className="flex-1 h-1.5 rounded-sm bg-white/10 overflow-hidden">
                  <div className="h-full w-[42%] bg-rose-400" />
                </div>
                <span className="font-mono text-[11px] text-rose-300 tabular-nums">42%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3.5 max-w-md pt-6 border-t border-white/15">
          <div className="flex items-start gap-3">
            <GraduationCap className="h-5 w-5 text-blue-300 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-white">Turmas e tentativas controladas</p>
              <p className="text-xs text-slate-300 leading-relaxed">
                Cada tentativa é contabilizada e refazer exige autorização do professor.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-300 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-white">Correção determinística transparente</p>
              <p className="text-xs text-slate-300 leading-relaxed">
                Resolução comentada por questão e observações manuais do professor.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form Column */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
        <div className="w-full max-w-md space-y-5">
          <Card padding="lg">
            <div className="mb-6">
              <h2 className="font-display text-xl font-bold tracking-tight text-[#131B2E]">
                Entrar na plataforma
              </h2>
              <p className="mt-1 text-sm text-[#4B5568]">
                Acesse com sua conta de aluno ou professor.
              </p>
            </div>

            {error && (
              <Alert tone="danger" className="mb-5">
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="login-email" className="block text-sm font-semibold text-[#131B2E]">
                  E-mail
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  aria-invalid={Boolean(error)}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.nome@synapta.edu"
                  className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2.5 text-base sm:text-sm text-[#131B2E] placeholder:text-slate-400 focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-sm font-semibold text-[#131B2E]"
                >
                  Senha
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    aria-invalid={Boolean(error)}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    className="block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2.5 pr-12 text-base sm:text-sm text-[#131B2E] placeholder:text-slate-400 focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute inset-y-0 right-0 flex min-w-[44px] items-center justify-center px-3 text-[#4B5568] hover:text-[#131B2E] cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={submitting}
                disabled={Boolean(demoLoadingEmail)}
                rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                className="w-full mt-2"
              >
                Entrar
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-[#4B5568]">
              Ainda não tem cadastro?{' '}
              <Link
                to="/register"
                className="inline-flex min-h-[44px] items-center px-1 font-semibold text-[#1B4FD8] hover:underline"
              >
                Criar nova conta
              </Link>
            </p>
          </Card>

          {/* Quick Demo Access (configurable via VITE_ENABLE_DEMO_LOGIN / SEED_ON_START / /health) */}
          {isDemoLoginEnabled && (
            <div className="rounded-[10px] border border-[#DCE1EB] bg-white p-4 shadow-card">
              <div className="flex items-center gap-2 font-display text-sm font-bold text-[#131B2E]">
                <UserCheck className="h-4 w-4 text-[#1B4FD8]" aria-hidden="true" />
                <span>Acesso Rápido (Demo)</span>
              </div>
              <p className="mt-1 text-xs text-[#4B5568]">
                Selecione um perfil de demonstração para entrar imediatamente.
              </p>
              <div className="mt-3 divide-y divide-[#DCE1EB] rounded-lg border border-[#DCE1EB] overflow-hidden">
                {DEMO_ACCOUNTS.map((account) => {
                  const isAccountLoading = demoLoadingEmail === account.email;
                  return (
                    <button
                      key={account.email}
                      type="button"
                      disabled={submitting || Boolean(demoLoadingEmail)}
                      onClick={() => handleDemoLogin(account)}
                      className="w-full min-h-[48px] flex items-center justify-between gap-3 bg-white px-3.5 py-2.5 text-left transition-colors hover:bg-[#F8F8F5] disabled:opacity-60 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-[#131B2E]">{account.label}</p>
                        <p className="truncate font-mono text-[11px] text-[#4B5568]">
                          {account.email}
                        </p>
                      </div>
                      <span
                        className={
                          account.role === 'teacher'
                            ? 'shrink-0 rounded border border-[#131B2E]/20 bg-[#131B2E]/8 px-2 py-0.5 text-[11px] font-semibold text-[#131B2E]'
                            : 'shrink-0 rounded border border-[#C7D7FE] bg-[#EEF3FF] px-2 py-0.5 text-[11px] font-semibold text-[#1640B0]'
                        }
                      >
                        {isAccountLoading ? 'Entrando...' : account.roleLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

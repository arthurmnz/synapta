import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, GraduationCap } from 'lucide-react';
import { clsx } from 'clsx';
import { Alert, Button, Card } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../lib/apiClient';
import type { UserRole } from '../../types/api';

export function RegisterPage() {
  const { register, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState<UserRole>('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard', {
        replace: true,
      });
    }
  }, [isAuthenticated, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Informe seu nome completo.');
      return;
    }
    if (!email.trim()) {
      setError('Informe um endereço de e-mail válido.');
      return;
    }
    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('A confirmação de senha não confere.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await register({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      });
      navigate(created.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard', {
        replace: true,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível concluir seu cadastro. Tente novamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F8F5] flex items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1B4FD8] text-white shadow-card">
            <svg
              width="20"
              height="20"
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
          <span className="font-display text-xl font-bold tracking-tight text-[#131B2E]">
            Synapta
          </span>
        </div>

        <Card padding="lg">
          <div className="mb-6">
            <h1 className="font-display text-xl font-bold tracking-tight text-[#131B2E]">
              Criar conta na Synapta
            </h1>
            <p className="mt-1 text-sm text-[#4B5568]">
              Escolha seu perfil de acesso e preencha seus dados.
            </p>
          </div>

          {error && (
            <Alert tone="danger" className="mb-5">
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <span className="block text-sm font-semibold text-[#131B2E] mb-2">
                Perfil de acesso
              </span>
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                role="radiogroup"
                aria-label="Perfil de acesso"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={role === 'student'}
                  onClick={() => setRole('student')}
                  className={clsx(
                    'min-h-[88px] rounded-[10px] border p-4 text-left transition-colors cursor-pointer',
                    role === 'student'
                      ? 'border-[#1B4FD8] bg-[#EEF3FF] ring-1 ring-[#1B4FD8]'
                      : 'border-[#DCE1EB] bg-white hover:border-[#9AA5BC]'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <GraduationCap
                      className={clsx('h-5 w-5', role === 'student' ? 'text-[#1B4FD8]' : 'text-[#4B5568]')}
                      aria-hidden="true"
                    />
                    <span className="font-display text-sm font-bold text-[#131B2E]">Aluno</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#4B5568]">
                    Entra em turmas, responde simulados e acompanha feedback por questão.
                  </p>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={role === 'teacher'}
                  onClick={() => setRole('teacher')}
                  className={clsx(
                    'min-h-[88px] rounded-[10px] border p-4 text-left transition-colors cursor-pointer',
                    role === 'teacher'
                      ? 'border-[#131B2E] bg-[#131B2E]/5 ring-1 ring-[#131B2E]'
                      : 'border-[#DCE1EB] bg-white hover:border-[#9AA5BC]'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <BookOpen
                      className={clsx('h-5 w-5', role === 'teacher' ? 'text-[#131B2E]' : 'text-[#4B5568]')}
                      aria-hidden="true"
                    />
                    <span className="font-display text-sm font-bold text-[#131B2E]">Professor</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#4B5568]">
                    Gerencia organizações, turmas e simulados, analisa assuntos e autoriza
                    tentativas.
                  </p>
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="register-name" className="block text-sm font-semibold text-[#131B2E]">
                Nome completo
              </label>
              <input
                id="register-name"
                type="text"
                autoComplete="name"
                required
                aria-invalid={Boolean(error && !name.trim())}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Beatriz Almeida"
                className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2.5 text-base sm:text-sm text-[#131B2E] placeholder:text-slate-400 focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
              />
            </div>

            <div>
              <label htmlFor="register-email" className="block text-sm font-semibold text-[#131B2E]">
                E-mail
              </label>
              <input
                id="register-email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={Boolean(error && !email.trim())}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@escola.edu.br"
                className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2.5 text-base sm:text-sm text-[#131B2E] placeholder:text-slate-400 focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="register-password"
                  className="block text-sm font-semibold text-[#131B2E]"
                >
                  Senha
                </label>
                <input
                  id="register-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  aria-describedby="register-password-hint"
                  aria-invalid={Boolean(password.length > 0 && password.length < 8)}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2.5 text-base sm:text-sm text-[#131B2E] placeholder:text-slate-400 focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                />
                <p
                  id="register-password-hint"
                  className={clsx(
                    'mt-1 text-xs',
                    password.length > 0 && password.length < 8
                      ? 'text-[#BE123C] font-medium'
                      : 'text-[#4B5568]'
                  )}
                >
                  Use pelo menos 8 caracteres.
                </p>
              </div>

              <div>
                <label
                  htmlFor="register-confirm"
                  className="block text-sm font-semibold text-[#131B2E]"
                >
                  Confirmar senha
                </label>
                <input
                  id="register-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  aria-describedby="register-confirm-hint"
                  aria-invalid={Boolean(confirmPassword && password !== confirmPassword)}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-[#CBD3E1] bg-white px-3.5 py-2.5 text-base sm:text-sm text-[#131B2E] placeholder:text-slate-400 focus:border-[#1B4FD8] focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20"
                />
                {confirmPassword && password !== confirmPassword ? (
                  <p id="register-confirm-hint" className="mt-1 text-xs font-medium text-[#BE123C]">
                    As senhas digitadas não conferem.
                  </p>
                ) : (
                  <p id="register-confirm-hint" className="mt-1 text-xs text-[#4B5568]">
                    Repita a mesma senha.
                  </p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={submitting}
              rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
              className="w-full"
            >
              Cadastrar como {role === 'teacher' ? 'Professor' : 'Aluno'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-[#4B5568]">
            Já possui uma conta?{' '}
            <Link
              to="/login"
              className="inline-flex min-h-[44px] items-center px-1 font-semibold text-[#1B4FD8] hover:underline"
            >
              Fazer login
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}

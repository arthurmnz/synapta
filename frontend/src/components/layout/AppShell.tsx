import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardList,
  GraduationCap,
  History,
  LogOut,
  Menu,
  Users,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../contexts/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const STUDENT_NAV: NavItem[] = [
  {
    to: '/student/dashboard',
    label: 'Simulados',
    icon: <ClipboardList className="h-4 w-4" aria-hidden="true" />,
  },
  {
    to: '/student/organizations',
    label: 'Organizações',
    icon: <Building2 className="h-4 w-4" aria-hidden="true" />,
  },
  {
    to: '/student/classrooms',
    label: 'Turmas',
    icon: <BookOpen className="h-4 w-4" aria-hidden="true" />,
  },
  {
    to: '/student/history',
    label: 'Histórico e Feedbacks',
    icon: <History className="h-4 w-4" aria-hidden="true" />,
  },
];

const TEACHER_NAV: NavItem[] = [
  {
    to: '/teacher/dashboard',
    label: 'Visão Analítica',
    icon: <BarChart3 className="h-4 w-4" aria-hidden="true" />,
  },
  {
    to: '/teacher/organizations',
    label: 'Organizações',
    icon: <Building2 className="h-4 w-4" aria-hidden="true" />,
  },
  {
    to: '/teacher/classrooms',
    label: 'Turmas e Simulados',
    icon: <BookOpen className="h-4 w-4" aria-hidden="true" />,
  },
  {
    to: '/teacher/students',
    label: 'Alunos',
    icon: <Users className="h-4 w-4" aria-hidden="true" />,
  },
];

function SynaptaBrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#1B4FD8] text-white">
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
      <div className="min-w-0">
        <span className="block font-display text-base font-bold tracking-tight text-white">
          Synapta
        </span>
        <span className="block text-[11px] font-medium text-slate-300">
          Plataforma Educacional
        </span>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = user?.role === 'teacher' ? TEACHER_NAV : STUDENT_NAV;
  const portalLabel = user?.role === 'teacher' ? 'Portal do Professor' : 'Portal do Aluno';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderNavLinks = (onSelect?: () => void) => (
    <nav aria-label="Navegação principal" className="space-y-1">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onSelect}
          className={({ isActive }) =>
            clsx(
              'flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
              isActive
                ? 'bg-[#1B4FD8] text-white'
                : 'text-slate-200 hover:bg-white/10 hover:text-white'
            )
          }
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#F8F8F5] text-[#131B2E] flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#131B2E] text-white border-r border-slate-800/80">
        <div className="flex h-16 items-center justify-between px-5 border-b border-white/10">
          <SynaptaBrandMark />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          <div className="px-3 pb-3 flex items-center gap-2 text-xs font-medium text-slate-300">
            <GraduationCap className="h-3.5 w-3.5 text-blue-300" aria-hidden="true" />
            <span>{portalLabel}</span>
          </div>
          {renderNavLinks()}
        </div>

        <div className="border-t border-white/10 p-4 space-y-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
            <p className="truncate text-xs text-slate-300">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/15 transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Sair da conta</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between bg-[#131B2E] px-4 py-2.5 text-white border-b border-white/10">
        <SynaptaBrandMark />
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs font-medium text-slate-200">{user?.name}</span>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileMenuOpen}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-100 hover:bg-white/10 transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 top-[60px] z-40 bg-[#131B2E]/50"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-72 max-w-[85vw] h-full bg-[#131B2E] text-white p-4 flex flex-col justify-between shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="px-3 flex items-center gap-2 text-xs font-medium text-slate-300">
                <GraduationCap className="h-3.5 w-3.5 text-blue-300" aria-hidden="true" />
                <span>{portalLabel}</span>
              </div>
              {renderNavLinks(() => setMobileMenuOpen(false))}
            </div>

            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
                <p className="truncate text-xs text-slate-300">{user?.email}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/15 transition-colors cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sair da conta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 lg:pl-64 min-w-0">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}

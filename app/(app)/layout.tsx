'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/auth';
import type { UserResponse } from '@/context/auth';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { token, user, logout, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !token) {
      router.replace('/login');
    }
  }, [isLoading, token, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-500" />
      </div>
    );
  }

  if (!token || !user) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="relative z-50 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-emerald-600 group-hover:bg-emerald-500 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-white" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-100">Blind Storage</span>
            </Link>

            <nav className="hidden items-center gap-1 sm:flex">
              <Link href="/dashboard" className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors">
                Tableau de bord
              </Link>
              <Link href="/storage" className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors">
                Mes fichiers
              </Link>
            </nav>
          </div>

          <UserMenu user={user} logout={logout} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-8 pt-8">
        {children}
      </main>
    </div>
  );
}

function UserMenu({
  user,
  logout,
}: {
  user: UserResponse;
  logout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu utilisateur"
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-[100] mt-2 w-52 rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-2xl shadow-black/40">
          <div className="px-3 py-2.5 border-b border-slate-700/60">
            <p className="text-sm font-medium text-slate-200 truncate">{user.username}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>

          <div className="py-1">
            <MenuItem
              href="/dashboard"
              label="Tableau de bord"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              }
              onClick={() => setOpen(false)}
            />
            <MenuItem
              href="/storage"
              label="Mes fichiers"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                  <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
              }
              onClick={() => setOpen(false)}
            />
            <MenuItem
              href="/account"
              label="Mon compte"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              }
              onClick={() => setOpen(false)}
            />
            <MenuItem
              href="/keys"
              label="Mes clés"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                  <circle cx="8" cy="15" r="4" />
                  <path d="M12 11l8-8m0 0h-3m3 0v3" />
                </svg>
              }
              onClick={() => setOpen(false)}
            />
          </div>

          <div className="border-t border-slate-700/60 py-1">
            <button
              onClick={() => { setOpen(false); logout(); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                <path d="M17 16l4-4m0 0l-4-4m4 4H7" /><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              </svg>
              Déconnexion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  href,
  label,
  icon,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
    >
      <span className="text-slate-500">{icon}</span>
      {label}
    </Link>
  );
}

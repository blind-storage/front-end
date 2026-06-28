'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/context/auth';

const FEATURES = [
  {
    title: 'Chiffrement bout en bout',
    description: 'Vos fichiers sont chiffrés sur votre appareil avant d\'être transmis. Le serveur ne voit que des données chiffrées.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
  },
  {
    title: 'Zéro connaissance',
    description: 'Votre mot de passe maître ne quitte jamais votre appareil. Personne — pas même les administrateurs — ne peut lire vos données.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    title: 'Double facteur',
    description: 'Ajoutez une couche de protection supplémentaire avec TOTP (Google Authenticator, Aegis, Authy…).',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path d="M12 2a5 5 0 100 10A5 5 0 0012 2z" /><path d="M9 15l-3 7h12l-3-7" />
      </svg>
    ),
  },
  {
    title: 'Connexion sociale',
    description: 'Liez votre compte Google, Rezel ou Dropbox pour vous connecter sans mot de passe, tout en conservant le chiffrement.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
      </svg>
    ),
  },
];

export default function HomePage() {
  const { token, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && token) {
      router.replace('/dashboard');
    }
  }, [isLoading, token, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Nav */}
      <header className="border-b border-slate-800/60 bg-slate-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-emerald-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-white">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <span className="text-sm font-semibold">Blind Storage</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors">
              Se connecter
            </Link>
            <Link href="/register" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors">
              Créer un compte
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-slate-100 sm:text-6xl">
          Stockage{' '}
          <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            zéro connaissance
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-slate-400 leading-relaxed">
          Vos fichiers, chiffrés sur votre appareil. Le serveur ne stocke que des données qu&apos;il ne peut pas lire.
          Votre vie privée est garantie par les mathématiques, pas par des promesses.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" className="rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors">
            Se connecter
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ title, description, icon }) => (
            <div key={title} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 hover:border-slate-700 transition-colors">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                {icon}
              </div>
              <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-600">
        Blind Storage — stockage chiffré de bout en bout
      </footer>
    </div>
  );
}

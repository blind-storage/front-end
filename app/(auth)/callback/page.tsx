'use client';

// Landing page after the backend OIDC redirect.
// The backend is expected to redirect here with one of:
//   ?token=<jwt>                                → direct login (OidcConnection already exists)
//   ?setup_token=<t>&email=<e>                 → new account, must complete setup
//   ?link_token=<t>&email=<e>                  → email matches an existing account, must confirm link
//   ?error=<message>                           → something went wrong

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/context/auth';
import * as api from '@/lib/api';
import { Alert } from '@/components/ui/alert';
import { PENDING_OIDC_TOKEN_KEY } from '@/app/(auth)/oidc-unlock/page';

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const { token: authToken, setSession, isLoading: authLoading } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return; // wait for session to be restored from localStorage

    const token = params.get('token');
    const setupToken = params.get('setup_token');
    const linkToken = params.get('link_token');
    const email = params.get('email');
    const err = params.get('error');

    if (err) {
      setError(decodeURIComponent(err));
      return;
    }

    if (token) {
      sessionStorage.setItem(PENDING_OIDC_TOKEN_KEY, token);
      router.replace('/oidc-unlock');
      return;
    }

    // Provider linked from the account settings page — user is already authenticated
    if ((setupToken || linkToken) && authToken) {
      const oidcToken = (setupToken ?? linkToken)!;
      (async () => {
        try {
          await api.oidcLink(authToken, oidcToken);
          router.replace('/account?linked=1');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Impossible de lier le compte.');
        }
      })();
      return;
    }

    if (setupToken && email) {
      router.replace(`/oidc-setup?setup_token=${encodeURIComponent(setupToken)}&email=${encodeURIComponent(email)}`);
      return;
    }

    if (linkToken && email) {
      router.replace(`/oidc-link?link_token=${encodeURIComponent(linkToken)}&email=${encodeURIComponent(email)}`);
      return;
    }

    setError("Paramètres de callback manquants. Vérifiez la configuration du backend.");
  }, [params, router, setSession, authToken, authLoading]);

  if (error) {
    return (
      <div className="w-full max-w-sm">
        <Alert variant="error" title="Erreur d'authentification">
          {error}
        </Alert>
        <a href="/login" className="mt-4 block text-center text-sm text-emerald-400 hover:text-emerald-300">
          Retour à la connexion
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-500" />
      <p className="text-sm text-slate-400">Authentification en cours…</p>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-500" />
        <p className="text-sm text-slate-400">Chargement…</p>
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}

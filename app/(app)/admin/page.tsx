'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth';
import * as api from '@/lib/api';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function AdminPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<api.UserResponse[]>([]);
  const [fetchStatus, setFetchStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user || !token || user.role !== 'ADMIN') {
      router.replace('/dashboard');
      return;
    }
    api
      .listUsers(token)
      .then((list) => { setUsers(list); setFetchStatus('ok'); })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Erreur.'); setFetchStatus('error'); });
  }, [isLoading, user, token, router]);

  async function handleDelete(target: api.UserResponse) {
    if (!token) return;
    if (!confirm(`Supprimer le compte « ${target.username} » ? Cette action est irréversible.`)) return;
    setDeletingId(target.id);
    setError('');
    try {
      await api.deleteUser(target.id, token);
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la suppression.');
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading || fetchStatus === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Administration</h1>
        <p className="mt-1 text-sm text-slate-400">{users.length} utilisateur{users.length !== 1 ? 's' : ''} enregistré{users.length !== 1 ? 's' : ''}.</p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {fetchStatus === 'error' && !error && <Alert variant="error">Impossible de charger les utilisateurs.</Alert>}

      {fetchStatus === 'ok' && (
        <Card>
          <div className="overflow-x-auto -mx-6 -my-5">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3">Utilisateur</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Rôle</th>
                  <th className="px-6 py-3">2FA</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-6 py-3">
                      <span className="font-medium text-slate-200">{u.username}</span>
                      {u.id === user?.id && (
                        <span className="ml-2 rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">vous</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-400">{u.email}</td>
                    <td className="px-6 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-6 py-3">
                      {u.totpEnabled ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          Activé
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {u.id !== user?.id && (
                        <Button
                          variant="danger"
                          className="px-3 py-1.5 text-xs"
                          isLoading={deletingId === u.id}
                          onClick={() => handleDelete(u)}
                        >
                          Supprimer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'ADMIN') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        Admin
      </span>
    );
  }
  return <span className="text-xs text-slate-500">Utilisateur</span>;
}

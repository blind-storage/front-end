'use client';

import Link from 'next/link';
import { useAuth } from '@/context/auth';
import { Card } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';

export default function DashboardPage() {
  const { user, privateKey } = useAuth();
  if (!user) return null;

  const keyStatus = privateKey ? 'Clé privée déchiffrée en mémoire' : 'Clé privée non chargée — reconnectez-vous';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Tableau de bord</h1>
        <p className="mt-1 text-sm text-slate-400">Bienvenue, {user.username}.</p>
      </div>

      {!privateKey && (
        <Alert variant="warning" title="Clé privée non déchiffrée">
          La clé privée n'est pas disponible en mémoire. Déconnectez-vous et reconnectez-vous pour la déchiffrer.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatusCard
          icon="🔑"
          title="Clé privée"
          value={privateKey ? 'Active' : 'Absente'}
          detail={keyStatus}
          ok={!!privateKey}
        />
        <StatusCard
          icon="🔐"
          title="Double facteur"
          value={user.totpEnabled ? 'Activé' : 'Désactivé'}
          detail={
            user.totpEnabled
              ? `${user.totp_recovery_codes_remaining ?? '?'} codes de secours restants`
              : 'Recommandé pour sécuriser votre compte'
          }
          ok={user.totpEnabled}
        />
        <StatusCard
          icon="👤"
          title="Rôle"
          value={user.role}
          detail={`ID : ${user.id.slice(0, 8)}…`}
          ok
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Clé publique" description="Partagée avec le serveur et les autres utilisateurs.">
          <div className="overflow-hidden rounded-lg bg-slate-900 p-3">
            <p className="break-all font-mono text-xs text-slate-400 leading-relaxed">
              {user.pub_key.slice(0, 120)}…
            </p>
          </div>
        </Card>

        <Card title="Actions rapides">
          <div className="space-y-2">
            <QuickLink href="/account" label="Modifier mon profil" />
            <QuickLink href="/security" label="Changer mon mot de passe" />
            <QuickLink href="/security#totp" label="Gérer le double facteur" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  value,
  detail,
  ok,
}: {
  icon: string;
  title: string;
  value: string;
  detail: string;
  ok: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xl">{icon}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
          }`}
        >
          {value}
        </span>
      </div>
      <p className="text-sm font-medium text-slate-200">{title}</p>
      <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-slate-700/50 hover:text-slate-100"
    >
      {label}
      <span className="text-slate-600">→</span>
    </Link>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Settings,
  UserCircle,
  BellRing,
  Palette,
  Info,
  ExternalLink,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { useDarkMode } from '@/hooks/useDarkMode';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/utils/cn';
import { Badge, Card, Switch, useToast } from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface NotificationPreferences {
  approval: { inApp: boolean; email: boolean };
  price_alert: { inApp: boolean; email: boolean };
  non_conformity: { inApp: boolean; email: boolean };
  invoice: { inApp: boolean; email: boolean };
  document: { inApp: boolean; email: boolean };
  order: { inApp: boolean; email: boolean };
}

const NOTIFICATION_TYPES: {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}[] = [
  {
    key: 'approval',
    label: 'Approvazioni',
    description: 'Richieste di approvazione ordini',
  },
  {
    key: 'price_alert',
    label: 'Variazioni Prezzo',
    description: 'Notifiche su variazioni significative di prezzo',
  },
  {
    key: 'non_conformity',
    label: 'Non Conformita',
    description: 'Segnalazioni di merce non conforme',
  },
  {
    key: 'invoice',
    label: 'Fatture',
    description: 'Nuove fatture e scadenze di pagamento',
  },
  {
    key: 'document',
    label: 'Documenti',
    description: 'Scadenze certificazioni e contratti',
  },
  {
    key: 'order',
    label: 'Ordini',
    description: 'Aggiornamenti stato ordini',
  },
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Amministratore',
  manager: 'Manager',
  operator: 'Operatore',
  viewer: 'Visualizzatore',
};

const DEFAULT_PREFS: NotificationPreferences = {
  approval: { inApp: true, email: true },
  price_alert: { inApp: true, email: false },
  non_conformity: { inApp: true, email: true },
  invoice: { inApp: true, email: false },
  document: { inApp: true, email: false },
  order: { inApp: true, email: false },
};

/* ------------------------------------------------------------------ */
/*  Section Wrapper                                                    */
/* ------------------------------------------------------------------ */

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Settings;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
            <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {title}
            </h2>
            {description && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {description}
              </p>
            )}
          </div>
        </div>
        {children}
      </Card>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { isDark, setDark } = useDarkMode();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Notification preferences
  const { data: prefs } = useQuery<NotificationPreferences>({
    queryKey: ['settings', 'notification-preferences'],
    queryFn: async () => {
      const res = await apiClient.get<NotificationPreferences>(
        '/settings/notification-preferences'
      );
      return res.data;
    },
  });

  const [localPrefs, setLocalPrefs] = useState<NotificationPreferences | null>(null);
  const activePrefs = localPrefs ?? prefs ?? DEFAULT_PREFS;

  const prefsMutation = useMutation({
    mutationFn: (data: NotificationPreferences) =>
      apiClient.put('/settings/notification-preferences', data),
    onSuccess: () => {
      toast('Preferenze aggiornate', 'success');
      queryClient.invalidateQueries({ queryKey: ['settings', 'notification-preferences'] });
    },
    onError: () => toast('Errore nel salvataggio delle preferenze', 'error'),
  });

  const handleToggleEmail = (key: keyof NotificationPreferences, value: boolean) => {
    const updated = {
      ...activePrefs,
      [key]: { ...activePrefs[key], email: value },
    };
    setLocalPrefs(updated);
    prefsMutation.mutate(updated);
  };

  const userName = user ? `${user.firstName} ${user.lastName}` : 'Utente';
  const userRole = user?.role ? (ROLE_LABELS[user.role] || user.role) : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Settings className="h-7 w-7 text-accent-green" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Impostazioni
        </h1>
      </div>

      {/* Profile section */}
      <SettingsSection
        icon={UserCircle}
        title="Profilo"
        description="Informazioni del tuo account"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Nome
            </p>
            <p className="mt-1 text-sm text-slate-900 dark:text-white">
              {userName}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Email
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {user?.email || '-'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Ruolo
            </p>
            <div className="mt-1">
              <Badge
                variant={
                  user?.role === 'admin'
                    ? 'success'
                    : user?.role === 'manager'
                      ? 'info'
                      : 'neutral'
                }
              >
                {userRole || '-'}
              </Badge>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Notification Preferences */}
      <SettingsSection
        icon={BellRing}
        title="Preferenze Notifiche"
        description="Configura come ricevere le notifiche"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Tipo
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  In-App
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Email
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {NOTIFICATION_TYPES.map((nt) => (
                <tr key={nt.key}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-slate-900 dark:text-white">
                      {nt.label}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {nt.description}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center">
                      <Switch
                        checked={true}
                        disabled={true}
                        onChange={() => {}}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center">
                      <Switch
                        checked={activePrefs[nt.key].email}
                        onChange={(v) => handleToggleEmail(nt.key, v)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsSection>

      {/* Theme */}
      <SettingsSection
        icon={Palette}
        title="Tema"
        description="Personalizza l'aspetto dell'applicazione"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              Modalita scura
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isDark ? 'Tema scuro attivo' : 'Tema chiaro attivo'}
            </p>
          </div>
          <Switch
            checked={isDark}
            onChange={(v) => setDark(v)}
          />
        </div>
      </SettingsSection>

      {/* App Info */}
      <SettingsSection
        icon={Info}
        title="Informazioni"
        description="Dettagli sull'applicazione"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Versione
            </span>
            <Badge variant="neutral">0.1.0</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Ambiente
            </span>
            <Badge
              variant={
                import.meta.env.MODE === 'production' ? 'success' : 'warning'
              }
            >
              {import.meta.env.MODE === 'production' ? 'Produzione' : 'Sviluppo'}
            </Badge>
          </div>
          <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
            <a
              href="https://docs.cph.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-green transition-colors hover:text-green-700 dark:hover:text-green-300"
            >
              <ExternalLink className="h-4 w-4" />
              Documentazione
            </a>
          </div>
        </div>
      </SettingsSection>
    </motion.div>
  );
}

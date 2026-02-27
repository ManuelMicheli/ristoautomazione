import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, Bell, ChevronRight, User, LogOut } from 'lucide-react';
import { useDarkMode } from '@/hooks/useDarkMode';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient } from '@/services/api-client';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { cn } from '@/utils/cn';
import { NotificationPanel } from './NotificationPanel';

// Route segment to Italian label mapping
const segmentLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  suppliers: 'Fornitori',
  products: 'Prodotti',
  orders: 'Ordini',
  receiving: 'Ricezione',
  invoices: 'Fatture',
  settings: 'Impostazioni',
  new: 'Nuovo',
  edit: 'Modifica',
  profile: 'Profilo',
  ranking: 'Classifica',
  'risk-map': 'Mappa Rischi',
};

const roleLabels: Record<string, string> = {
  admin: 'Amministratore',
  manager: 'Manager',
  operator: 'Operatore',
  viewer: 'Visualizzatore',
};

function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      {segments.map((segment, index) => {
        const path = '/' + segments.slice(0, index + 1).join('/');
        const label = segmentLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
        const isLast = index === segments.length - 1;

        return (
          <span key={path} className="flex items-center gap-1.5">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
            )}
            {isLast ? (
              <span className="font-medium text-slate-900 dark:text-white">
                {label}
              </span>
            ) : (
              <Link
                to={path}
                className="text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function Header() {
  const { isDark, toggle: toggleDarkMode } = useDarkMode();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [panelOpen, setPanelOpen] = useState(false);
  const prevCountRef = useRef(0);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const userName = user ? `${user.firstName} ${user.lastName}` : 'Utente';
  const userRole = user?.role ? (roleLabels[user.role] || user.role) : '';

  // Poll for unread notification count
  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const res = await apiClient.get<{ count: number }>('/notifications/unread-count');
      return res.data;
    },
    refetchInterval: 30000,
  });

  const unreadCount = unreadData?.count ?? 0;

  // Track if count changed for pulse animation
  const [shouldPulse, setShouldPulse] = useState(false);
  useEffect(() => {
    if (unreadCount > prevCountRef.current && prevCountRef.current >= 0) {
      setShouldPulse(true);
      const timer = setTimeout(() => setShouldPulse(false), 2000);
      return () => clearTimeout(timer);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-gray-200 bg-white/80 px-6 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
        {/* Breadcrumbs */}
        <div className="flex-1">
          <Breadcrumbs />
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {/* Dark mode toggle */}
          <button
            type="button"
            onClick={toggleDarkMode}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            title={isDark ? 'Modalita chiara' : 'Modalita scura'}
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {/* Notifications */}
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            title="Notifiche"
          >
            <Bell className="h-5 w-5" />
            <AnimatePresence>
              {unreadCount > 0 && (
                <motion.span
                  key="badge"
                  initial={{ scale: 0 }}
                  animate={{
                    scale: 1,
                    ...(shouldPulse
                      ? {
                          boxShadow: [
                            '0 0 0 0 rgba(239, 68, 68, 0.4)',
                            '0 0 0 8px rgba(239, 68, 68, 0)',
                          ],
                        }
                      : {}),
                  }}
                  exit={{ scale: 0 }}
                  transition={{
                    scale: { type: 'spring', stiffness: 500, damping: 20 },
                    boxShadow: {
                      repeat: shouldPulse ? 3 : 0,
                      duration: 0.6,
                    },
                  }}
                  className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-red px-1 text-[10px] font-bold text-white"
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* User dropdown */}
          <DropdownMenu
            align="right"
            trigger={
              <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
                <Avatar name={userName} size="sm" />
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {userName}
                  </p>
                  {userRole && (
                    <Badge variant="neutral" size="sm">
                      {userRole}
                    </Badge>
                  )}
                </div>
              </div>
            }
            items={[
              {
                label: 'Profilo',
                icon: <User className="h-4 w-4" />,
                onClick: () => navigate('/settings'),
              },
              { label: '', divider: true },
              {
                label: 'Esci',
                icon: <LogOut className="h-4 w-4" />,
                onClick: handleLogout,
                variant: 'danger',
              },
            ]}
          />
        </div>
      </header>

      {/* Notification Panel (Sheet) */}
      <NotificationPanel isOpen={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}

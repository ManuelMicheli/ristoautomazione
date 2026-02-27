import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  AlertOctagon,
  FileText,
  CheckCircle,
  CheckCheck,
  BellOff,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatRelative } from '@/utils/format-date';
import { cn } from '@/utils/cn';
import { Sheet, Skeleton } from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Notification {
  id: string;
  type: 'approval' | 'price_alert' | 'non_conformity' | 'discrepancy' | 'invoice' | 'document' | 'order' | 'info';
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TYPE_CONFIG: Record<
  string,
  { icon: typeof AlertTriangle; color: string; bg: string }
> = {
  approval: {
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
  },
  price_alert: {
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
  },
  non_conformity: {
    icon: AlertOctagon,
    color: 'text-red-500',
    bg: 'bg-red-100 dark:bg-red-900/30',
  },
  discrepancy: {
    icon: AlertOctagon,
    color: 'text-red-500',
    bg: 'bg-red-100 dark:bg-red-900/30',
  },
  invoice: {
    icon: FileText,
    color: 'text-blue-500',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
  },
  document: {
    icon: CheckCircle,
    color: 'text-green-500',
    bg: 'bg-green-100 dark:bg-green-900/30',
  },
  order: {
    icon: CheckCircle,
    color: 'text-green-500',
    bg: 'bg-green-100 dark:bg-green-900/30',
  },
  info: {
    icon: CheckCircle,
    color: 'text-green-500',
    bg: 'bg-green-100 dark:bg-green-900/30',
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG['info']!;
}

function groupNotifications(notifications: Notification[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: { label: string; items: Notification[] }[] = [
    { label: 'Oggi', items: [] },
    { label: 'Questa Settimana', items: [] },
    { label: 'Precedenti', items: [] },
  ];

  for (const n of notifications) {
    const date = new Date(n.createdAt);
    if (date >= today) {
      groups[0]!.items.push(n);
    } else if (date >= weekAgo) {
      groups[1]!.items.push(n);
    } else {
      groups[2]!.items.push(n);
    }
  }

  return groups.filter((g) => g.items.length > 0);
}

/* ------------------------------------------------------------------ */
/*  Notification Item                                                  */
/* ------------------------------------------------------------------ */

function NotificationItem({
  notification,
  onRead,
  onNavigate,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onNavigate: (link: string) => void;
}) {
  const config = getTypeConfig(notification.type)!;
  const Icon = config.icon;

  const handleClick = () => {
    if (!notification.isRead) {
      onRead(notification.id);
    }
    if (notification.link) {
      onNavigate(notification.link);
    }
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50',
        !notification.isRead && 'border-l-2 border-l-green-500 bg-green-50/50 dark:bg-green-900/5'
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          config.bg
        )}
      >
        <Icon className={cn('h-4 w-4', config.color)} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm',
            !notification.isRead
              ? 'font-semibold text-slate-900 dark:text-white'
              : 'font-medium text-slate-700 dark:text-slate-300'
          )}
        >
          {notification.title}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
          {notification.message}
        </p>
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          {formatRelative(notification.createdAt)}
        </p>
      </div>

      {/* Unread dot */}
      {!notification.isRead && (
        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-green-500" />
      )}
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function NotificationPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiClient.get<Notification[]>('/notifications', {
        pageSize: 50,
      });
      return res.data;
    },
    enabled: isOpen,
  });

  const readMutation = useMutation({
    mutationFn: (id: string) => apiClient.put(`/notifications/${id}/read`),
    onMutate: async (id) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const prev = queryClient.getQueryData<Notification[]>(['notifications']);
      queryClient.setQueryData<Notification[]>(['notifications'], (old) =>
        old?.map((n) => (n.id === id ? { ...n, isRead: true } : n)) ?? []
      );
      // Also update unread count
      queryClient.setQueryData<{ count: number }>(['notifications', 'unread-count'], (old) =>
        old ? { count: Math.max(0, old.count - 1) } : { count: 0 }
      );
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['notifications'], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  const readAllMutation = useMutation({
    mutationFn: () => apiClient.put('/notifications/read-all'),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const prev = queryClient.getQueryData<Notification[]>(['notifications']);
      queryClient.setQueryData<Notification[]>(['notifications'], (old) =>
        old?.map((n) => ({ ...n, isRead: true })) ?? []
      );
      queryClient.setQueryData<{ count: number }>(['notifications', 'unread-count'], { count: 0 });
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['notifications'], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  const handleRead = useCallback(
    (id: string) => {
      readMutation.mutate(id);
    },
    [readMutation]
  );

  const handleNavigate = useCallback(
    (link: string) => {
      onClose();
      navigate(link);
    },
    [navigate, onClose]
  );

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const groups = groupNotifications(notifications);

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Notifiche" width="md">
      {/* Mark all as read */}
      {unreadCount > 0 && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => readAllMutation.mutate()}
            disabled={readAllMutation.isPending}
            className="flex items-center gap-1.5 text-xs font-medium text-accent-green transition-colors hover:text-green-700 dark:hover:text-green-300"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Segna tutte come lette
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} variant="rect" height={72} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && notifications.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
            <BellOff className="h-8 w-8 text-slate-400 dark:text-slate-500" />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Nessuna notifica
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Le notifiche appariranno qui.
          </p>
        </div>
      )}

      {/* Grouped notifications */}
      {!isLoading &&
        groups.map((group) => (
          <div key={group.label} className="mb-6">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onRead={handleRead}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          </div>
        ))}
    </Sheet>
  );
}

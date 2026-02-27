import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  LayoutDashboard,
  Euro,
  ShoppingCart,
  AlertTriangle,
  ClipboardCheck,
  Plus,
  Upload,
  PackageCheck,
  ArrowRight,
  Flame,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatCurrency } from '@/utils/format-currency';
import { formatDate, formatRelative } from '@/utils/format-date';
import { cn } from '@/utils/cn';
import {
  Badge,
  Button,
  Card,
  Skeleton,
  StatCard,
} from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DashboardStats {
  monthlySpend: number;
  monthlySpendTrend: { value: number; direction: 'up' | 'down' };
  activeOrders: number;
  activeAlerts: number;
  pendingActions: number;
}

interface SpendingPoint {
  month: string;
  amount: number;
}

interface CategorySpend {
  category: string;
  amount: number;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  supplierName: string;
  status: string;
  totalAmount: number;
  date: string;
  isUrgent: boolean;
}

interface AlertItem {
  id: string;
  type: 'price_increase' | 'delivery_delay' | 'expiring_contract' | 'low_stock' | 'action_required';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error';
  createdAt: string;
  actionUrl?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ITALIAN_MONTHS = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
];

const PIE_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

const STATUS_LABEL: Record<string, string> = {
  draft: 'Bozza',
  pending_approval: 'In Approvazione',
  approved: 'Approvato',
  sent: 'Inviato',
  confirmed: 'Confermato',
  partially_received: 'Ricevuto Parz.',
  received: 'Ricevuto',
  closed: 'Chiuso',
  cancelled: 'Annullato',
};

const STATUS_VARIANT: Record<string, 'draft' | 'pending_approval' | 'approved' | 'sent' | 'confirmed' | 'received' | 'closed' | 'cancelled' | 'neutral'> = {
  draft: 'draft',
  pending_approval: 'pending_approval',
  approved: 'approved',
  sent: 'sent',
  confirmed: 'confirmed',
  received: 'received',
  closed: 'closed',
  cancelled: 'cancelled',
};

const ALERT_SEVERITY_STYLES: Record<string, string> = {
  info: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20',
  warning: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20',
  error: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20',
};

const ALERT_ICON_STYLES: Record<string, string> = {
  info: 'text-blue-500',
  warning: 'text-amber-500',
  error: 'text-accent-red',
};

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */

const fadeInUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const navigate = useNavigate();

  /* --- Stats --- */
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['analytics', 'dashboard-stats'],
    queryFn: async () => {
      const res = await apiClient.get<DashboardStats>('/analytics/dashboard');
      return res.data;
    },
    staleTime: 5 * 60_000,
  });

  /* --- Spending Trend --- */
  const { data: spendingTrend = [] } = useQuery<SpendingPoint[]>({
    queryKey: ['analytics', 'spending-trend'],
    queryFn: async () => {
      const res = await apiClient.get<SpendingPoint[]>('/analytics/spending-trend', {
        months: 12,
      });
      return res.data;
    },
    staleTime: 5 * 60_000,
  });

  /* --- Category Breakdown --- */
  const { data: categoryBreakdown = [] } = useQuery<CategorySpend[]>({
    queryKey: ['analytics', 'category-breakdown'],
    queryFn: async () => {
      const res = await apiClient.get<CategorySpend[]>('/analytics/category-breakdown');
      return res.data;
    },
    staleTime: 5 * 60_000,
  });

  /* --- Recent Orders --- */
  const { data: recentOrders = [] } = useQuery<RecentOrder[]>({
    queryKey: ['analytics', 'recent-orders'],
    queryFn: async () => {
      const res = await apiClient.get<RecentOrder[]>('/orders', {
        pageSize: 5,
        sortBy: 'date',
        sortDir: 'desc',
      });
      return res.data;
    },
    staleTime: 60_000,
  });

  /* --- Alerts --- */
  const { data: alerts = [] } = useQuery<AlertItem[]>({
    queryKey: ['analytics', 'alerts'],
    queryFn: async () => {
      const res = await apiClient.get<AlertItem[]>('/analytics/alerts');
      return res.data;
    },
    staleTime: 60_000,
  });

  /* --- Chart data formatting --- */
  const spendingChartData = useMemo(
    () =>
      spendingTrend.map((p) => ({
        ...p,
        monthLabel: ITALIAN_MONTHS[new Date(p.month).getMonth()] || p.month,
      })),
    [spendingTrend],
  );

  const pieTotal = useMemo(
    () => categoryBreakdown.reduce((s, c) => s + c.amount, 0),
    [categoryBreakdown],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        {...fadeInUp}
        transition={{ duration: 0.25 }}
        className="flex items-center gap-3"
      >
        <LayoutDashboard className="h-7 w-7 text-accent-green" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Dashboard
        </h1>
      </motion.div>

      {/* Row 1: Stat Cards */}
      <motion.div
        {...fadeInUp}
        transition={{ duration: 0.25, delay: 0.05 }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rect" height={120} />
          ))
        ) : (
          <>
            <StatCard
              icon={Euro}
              value={stats?.monthlySpend ?? 0}
              label="Spesa del Mese"
              prefix=""
              suffix=""
              trend={stats?.monthlySpendTrend}
            />
            <StatCard
              icon={ShoppingCart}
              value={stats?.activeOrders ?? 0}
              label="Ordini in Corso"
            />
            <StatCard
              icon={AlertTriangle}
              value={stats?.activeAlerts ?? 0}
              label="Alert Attivi"
            />
            <StatCard
              icon={ClipboardCheck}
              value={stats?.pendingActions ?? 0}
              label="Azioni Richieste"
            />
          </>
        )}
      </motion.div>

      {/* Row 2: Charts */}
      <motion.div
        {...fadeInUp}
        transition={{ duration: 0.25, delay: 0.1 }}
        className="grid gap-6 lg:grid-cols-3"
      >
        {/* Spending Trend - AreaChart */}
        <Card header="Andamento Spesa (12 Mesi)" className="lg:col-span-2">
          {spendingChartData.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-slate-400">
              Nessun dato disponibile
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={spendingChartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <defs>
                  <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                />
                <RechartsTooltip
                  formatter={(value: number) => [formatCurrency(value), 'Spesa']}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#spendGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Category Breakdown - PieChart */}
        <Card header="Ripartizione per Categoria">
          {categoryBreakdown.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-slate-400">
              Nessun dato disponibile
            </div>
          ) : (
            <div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="amount"
                    nameKey="category"
                  >
                    {categoryBreakdown.map((_entry, index) => (
                      <Cell
                        key={index}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number) => formatCurrency(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1.5">
                {categoryBreakdown.map((cat, i) => (
                  <div
                    key={cat.category}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-slate-600 dark:text-slate-300">
                        {cat.category}
                      </span>
                    </div>
                    <span className="font-medium tabular-nums text-slate-900 dark:text-white">
                      {pieTotal > 0
                        ? `${((cat.amount / pieTotal) * 100).toFixed(0)}%`
                        : '0%'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Row 3: Recent Orders + Alerts */}
      <motion.div
        {...fadeInUp}
        transition={{ duration: 0.25, delay: 0.15 }}
        className="grid gap-6 lg:grid-cols-2"
      >
        {/* Recent Orders */}
        <Card
          header={
            <div className="flex items-center justify-between">
              <span>Ordini Recenti</span>
              <Link
                to="/orders"
                className="flex items-center gap-1 text-sm font-medium text-accent-green hover:underline"
              >
                Tutti <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          }
        >
          {recentOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Nessun ordine recente.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {recentOrders.map((order) => (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}`}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30 -mx-2 px-2 rounded"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 dark:text-white">
                        {order.orderNumber}
                      </span>
                      {order.isUrgent && (
                        <Flame className="h-3.5 w-3.5 text-accent-red" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {order.supplierName} - {formatDate(order.date)}
                    </p>
                  </div>
                  <div className="ml-3 flex items-center gap-3">
                    <Badge
                      variant={STATUS_VARIANT[order.status] || 'neutral'}
                      size="sm"
                    >
                      {STATUS_LABEL[order.status] || order.status}
                    </Badge>
                    <span className="text-sm font-medium tabular-nums text-slate-900 dark:text-white">
                      {formatCurrency(order.totalAmount)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Alerts */}
        <Card
          header={
            <div className="flex items-center justify-between">
              <span>Notifiche e Azioni</span>
              {alerts.length > 0 && (
                <Badge variant="warning">{alerts.length}</Badge>
              )}
            </div>
          }
        >
          {alerts.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Nessuna notifica attiva.
            </p>
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 6).map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    'rounded-lg border p-3',
                    ALERT_SEVERITY_STYLES[alert.severity] || ALERT_SEVERITY_STYLES.info,
                  )}
                  role={alert.actionUrl ? 'button' : undefined}
                  onClick={
                    alert.actionUrl
                      ? () => navigate(alert.actionUrl!)
                      : undefined
                  }
                  style={alert.actionUrl ? { cursor: 'pointer' } : undefined}
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        ALERT_ICON_STYLES[alert.severity] || 'text-blue-500',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {alert.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {alert.description}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatRelative(alert.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        {...fadeInUp}
        transition={{ duration: 0.25, delay: 0.2 }}
      >
        <Card header="Azioni Rapide">
          <div className="flex flex-wrap gap-3">
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => navigate('/orders/new')}
            >
              Nuovo Ordine
            </Button>
            <Button
              variant="outline"
              icon={<Upload className="h-4 w-4" />}
              onClick={() => navigate('/invoices/upload')}
            >
              Carica Fattura
            </Button>
            <Button
              variant="outline"
              icon={<PackageCheck className="h-4 w-4" />}
              onClick={() => navigate('/receiving/new')}
            >
              Ricezione Merce
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  TrendingUp,
  FileWarning,
  Percent,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { apiClient } from '@/services/api-client';
import { formatCurrency } from '@/utils/format-currency';
import { formatDate } from '@/utils/format-date';
import { Badge, Button, Card, StatCard, DataTable, Skeleton, type ColumnDef } from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DiscrepancyStats {
  totalDiscrepancyAmount: number;
  invoicesWithErrors: number;
  errorRate: number;
}

interface SupplierDiscrepancy {
  supplierId: string;
  supplierName: string;
  amount: number;
  count: number;
}

interface TypeBreakdown {
  type: string;
  label: string;
  count: number;
  amount: number;
}

interface MonthlyTrend {
  month: string;
  amount: number;
  count: number;
}

interface RecentDiscrepancy {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  type: string;
  description: string;
  amount: number;
  date: string;
}

interface DiscrepanciesData {
  stats: DiscrepancyStats;
  bySupplier: SupplierDiscrepancy[];
  byType: TypeBreakdown[];
  monthlyTrend: MonthlyTrend[];
  recent: RecentDiscrepancy[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TYPE_LABEL: Record<string, string> = {
  price: 'Sovrapprezzo',
  quantity: 'Quantita',
  not_ordered: 'Non Ordinato',
  vat: 'IVA',
  missing_item: 'Articolo Mancante',
  extra_item: 'Articolo Extra',
};

const PIE_COLORS = ['#ef4444', '#f59e0b', '#6366f1', '#06b6d4', '#10b981', '#8b5cf6'];

const DISCREPANCY_TYPE_VARIANT: Record<string, 'error' | 'warning' | 'info'> = {
  price: 'error',
  quantity: 'warning',
  not_ordered: 'error',
  vat: 'info',
  missing_item: 'warning',
  extra_item: 'error',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function InvoiceDiscrepanciesPage() {
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery<DiscrepanciesData>({
    queryKey: ['invoices', 'discrepancies'],
    queryFn: async () => {
      const res = await apiClient.get<DiscrepanciesData>('/invoices/discrepancies');
      return res.data;
    },
  });

  /* --- Table columns --- */
  const columns: ColumnDef<RecentDiscrepancy>[] = useMemo(
    () => [
      {
        key: 'invoiceNumber',
        header: 'Fattura',
        cell: (row) => (
          <span className="font-semibold text-slate-900 dark:text-white">
            #{row.invoiceNumber}
          </span>
        ),
      },
      {
        key: 'supplierName',
        header: 'Fornitore',
        cell: (row) => (
          <span className="text-slate-700 dark:text-slate-300">{row.supplierName}</span>
        ),
      },
      {
        key: 'type',
        header: 'Tipo',
        cell: (row) => (
          <Badge variant={DISCREPANCY_TYPE_VARIANT[row.type] || 'warning'}>
            {TYPE_LABEL[row.type] || row.type}
          </Badge>
        ),
      },
      {
        key: 'description',
        header: 'Descrizione',
        cell: (row) => (
          <span className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">
            {row.description}
          </span>
        ),
      },
      {
        key: 'amount',
        header: 'Importo',
        cell: (row) => (
          <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
            {formatCurrency(row.amount)}
          </span>
        ),
      },
      {
        key: 'date',
        header: 'Data',
        cell: (row) => (
          <span className="tabular-nums text-slate-500 dark:text-slate-400">
            {formatDate(row.date)}
          </span>
        ),
      },
    ],
    [],
  );

  /* --- Loading --- */
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} variant="rect" height={120} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton variant="rect" height={300} />
          <Skeleton variant="rect" height={300} />
        </div>
        <Skeleton variant="rect" height={300} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20"
      >
        <p className="mb-4 text-sm text-red-700 dark:text-red-300">
          Errore nel caricamento delle discrepanze.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Riprova
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <AlertTriangle className="h-7 w-7 text-accent-red" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Discrepanze Fatture
        </h1>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={TrendingUp}
          value={Math.round(data.stats.totalDiscrepancyAmount)}
          label="Totale Discrepanze"
          prefix=""
          suffix=" EUR"
          className="border-red-200 dark:border-red-800"
        />
        <StatCard
          icon={FileWarning}
          value={data.stats.invoicesWithErrors}
          label="Fatture con Errori"
        />
        <StatCard
          icon={Percent}
          value={Math.round(data.stats.errorRate)}
          label="Tasso Errore"
          suffix="%"
        />
      </div>

      {/* Charts row */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Bar chart: per supplier */}
        <Card header="Discrepanze per Fornitore">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.bySupplier} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickFormatter={(v) => `${v} EUR`}
                />
                <YAxis
                  type="category"
                  dataKey="supplierName"
                  width={120}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <RechartTooltip
                  formatter={(value: number) => [formatCurrency(value), 'Importo']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="amount" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Pie chart: per type */}
        <Card header="Discrepanze per Tipo">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.byType.map((t) => ({
                    ...t,
                    name: t.label || TYPE_LABEL[t.type] || t.type,
                  }))}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {data.byType.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={PIE_COLORS[idx % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <RechartTooltip
                  formatter={(value: number, name: string) => [value, name]}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Line chart: monthly trend */}
      <Card header="Trend Mensile Discrepanze" className="mb-6">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: '#64748b' }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickFormatter={(v) => `${v} EUR`}
              />
              <RechartTooltip
                formatter={(value: number) => [formatCurrency(value), 'Discrepanze']}
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="amount"
                name="Importo Discrepanze"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 4, fill: '#ef4444' }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="count"
                name="Numero Discrepanze"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 4, fill: '#f59e0b' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Recent discrepancies table */}
      <Card header="Discrepanze Recenti">
        <div className="-mx-6 -my-4">
          <DataTable<RecentDiscrepancy>
            columns={columns}
            data={data.recent}
            onRowClick={(row) => navigate(`/invoices/${row.invoiceId}/reconcile`)}
            emptyMessage="Nessuna discrepanza recente"
          />
        </div>
      </Card>
    </motion.div>
  );
}

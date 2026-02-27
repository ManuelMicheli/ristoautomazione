import { useMemo, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ShoppingCart, Plus, Flame } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatDate } from '@/utils/format-date';
import { formatCurrency } from '@/utils/format-currency';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  SearchInput,
  Tabs,
  type ColumnDef,
  type TabItem,
} from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Order {
  id: string;
  orderNumber: string;
  supplierName: string;
  supplierId: string;
  createdAt: string;
  status: string;
  totalAmount: number;
  isUrgent: boolean;
  createdByName: string;
}

interface OrderListResponse {
  data: Order[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_VARIANT: Record<string, 'draft' | 'pending_approval' | 'approved' | 'sent' | 'confirmed' | 'received' | 'closed' | 'cancelled' | 'neutral'> = {
  draft: 'draft',
  pending_approval: 'pending_approval',
  approved: 'approved',
  sent: 'sent',
  confirmed: 'confirmed',
  partially_received: 'neutral',
  received: 'received',
  closed: 'closed',
  cancelled: 'cancelled',
};

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

const STATUS_TABS: TabItem[] = [
  { value: '', label: 'Tutti' },
  { value: 'draft', label: 'Bozza' },
  { value: 'pending_approval', label: 'In Approvazione' },
  { value: 'sent', label: 'Inviati' },
  { value: 'confirmed', label: 'Confermati' },
  { value: 'received', label: 'Ricevuti' },
  { value: 'closed', label: 'Chiusi' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function OrdersListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') || '1');
  const search = searchParams.get('q') || '';
  const status = searchParams.get('status') || '';
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const sortDir = (searchParams.get('sortDir') as 'asc' | 'desc') || 'desc';

  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        if (key !== 'page') next.set('page', '1');
        return next;
      });
    },
    [setSearchParams],
  );

  /* --- Query --- */
  const { data, isLoading, isError, refetch } = useQuery<OrderListResponse>({
    queryKey: ['orders', { page, search, status, sortBy, sortDir }],
    queryFn: async () => {
      const res = await apiClient.get<Order[]>('/orders', {
        page,
        pageSize: 20,
        q: search || undefined,
        status: status || undefined,
        sortBy,
        sortDir,
      });
      return { data: res.data, pagination: res.pagination! };
    },
    placeholderData: (prev) => prev,
  });

  /* --- Columns --- */
  const columns: ColumnDef<Order>[] = useMemo(
    () => [
      {
        key: 'orderNumber',
        header: 'N. Ordine',
        sortable: true,
        cell: (row) => (
          <div className="flex items-center gap-2">
            <Link
              to={`/orders/${row.id}`}
              className="font-semibold text-slate-900 hover:text-accent-green dark:text-white dark:hover:text-accent-green"
              onClick={(e) => e.stopPropagation()}
            >
              {row.orderNumber}
            </Link>
            {row.isUrgent && (
              <Flame className="h-4 w-4 text-accent-red" />
            )}
          </div>
        ),
      },
      {
        key: 'supplierName',
        header: 'Fornitore',
        sortable: true,
        cell: (row) => (
          <span className="text-slate-700 dark:text-slate-300">{row.supplierName}</span>
        ),
      },
      {
        key: 'createdAt',
        header: 'Data',
        sortable: true,
        cell: (row) => (
          <span className="text-slate-500 dark:text-slate-400">
            {formatDate(row.createdAt)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Stato',
        cell: (row) => (
          <Badge variant={STATUS_VARIANT[row.status] || 'neutral'}>
            {STATUS_LABEL[row.status] || row.status}
          </Badge>
        ),
      },
      {
        key: 'totalAmount',
        header: 'Totale',
        sortable: true,
        cell: (row) => (
          <span className="font-medium tabular-nums text-slate-900 dark:text-white">
            {formatCurrency(row.totalAmount)}
          </span>
        ),
      },
      {
        key: 'createdByName',
        header: 'Creato Da',
        cell: (row) => (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {row.createdByName}
          </span>
        ),
      },
    ],
    [],
  );

  /* --- Handlers --- */
  const handleSort = useCallback(
    (key: string, direction: 'asc' | 'desc') => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('sortBy', key);
        next.set('sortDir', direction);
        return next;
      });
    },
    [setSearchParams],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('page', String(newPage));
        return next;
      });
    },
    [setSearchParams],
  );

  /* --- Error --- */
  if (isError) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20"
      >
        <p className="mb-4 text-sm text-red-700 dark:text-red-300">
          Errore nel caricamento degli ordini.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Riprova
        </Button>
      </motion.div>
    );
  }

  const orders = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-7 w-7 text-accent-green" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Ordini di Acquisto
          </h1>
          {pagination && (
            <Badge variant="neutral">{pagination.total}</Badge>
          )}
        </div>
        <Button
          variant="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => navigate('/orders/new')}
        >
          Nuovo Ordine
        </Button>
      </div>

      {/* Status tabs */}
      <Tabs
        tabs={STATUS_TABS}
        value={status}
        onChange={(v) => setParam('status', v)}
        className="mb-4"
      />

      {/* Search */}
      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={(v) => setParam('q', v)}
          placeholder="Cerca per numero ordine o fornitore..."
          className="sm:w-96"
        />
      </div>

      {/* Table / Empty */}
      {!isLoading && orders.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nessun ordine trovato"
          description={
            search || status
              ? 'Prova a modificare i filtri di ricerca.'
              : 'Crea il primo ordine per iniziare.'
          }
          actionLabel={!search && !status ? 'Nuovo Ordine' : undefined}
          onAction={
            !search && !status
              ? () => navigate('/orders/new')
              : undefined
          }
        />
      ) : (
        <DataTable<Order>
          columns={columns}
          data={orders}
          loading={isLoading}
          sortKey={sortBy}
          sortDirection={sortDir}
          onSort={handleSort}
          onRowClick={(row) => navigate(`/orders/${row.id}`)}
          emptyMessage="Nessun ordine trovato"
          pagination={
            pagination
              ? {
                  page: pagination.page,
                  pageSize: pagination.pageSize,
                  total: pagination.total,
                  onPageChange: handlePageChange,
                }
              : undefined
          }
        />
      )}
    </motion.div>
  );
}

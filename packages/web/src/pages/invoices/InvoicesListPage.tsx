import { useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  FileText,
  Upload,
  Link2,
  Circle,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatDate } from '@/utils/format-date';
import { formatCurrency } from '@/utils/format-currency';
import { cn } from '@/utils/cn';
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

interface Invoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  issueDate: string;
  totalAmount: number;
  dueDate: string;
  status: string;
  ocrConfidence: number;
  isReconciled: boolean;
}

interface InvoiceListResponse {
  data: Invoice[];
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

const STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'success' | 'error' | 'info' | 'approved' | 'confirmed'> = {
  uploaded: 'neutral',
  processing: 'info',
  to_verify: 'warning',
  verified: 'success',
  disputed: 'error',
  to_pay: 'info',
  paid: 'success',
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: 'Caricata',
  processing: 'In Elaborazione',
  to_verify: 'Da Verificare',
  verified: 'Verificata',
  disputed: 'Contestata',
  to_pay: 'Da Pagare',
  paid: 'Pagata',
};

const STATUS_TABS: TabItem[] = [
  { value: '', label: 'Tutte' },
  { value: 'to_verify', label: 'Da Verificare' },
  { value: 'verified', label: 'Verificate' },
  { value: 'disputed', label: 'Contestate' },
  { value: 'to_pay', label: 'Da Pagare' },
  { value: 'paid', label: 'Pagate' },
];

function OcrDot({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.9
      ? 'text-green-500'
      : confidence >= 0.7
        ? 'text-amber-500'
        : 'text-red-500';
  return <Circle className={cn('h-3 w-3 fill-current', color)} />;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function InvoicesListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') || '1');
  const search = searchParams.get('q') || '';
  const status = searchParams.get('status') || '';
  const sortBy = searchParams.get('sortBy') || 'issueDate';
  const sortDir = (searchParams.get('sortDir') as 'asc' | 'desc') || 'desc';

  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.set('page', '1');
        return next;
      });
    },
    [setSearchParams],
  );

  /* --- Query --- */
  const { data, isLoading, isError, refetch } = useQuery<InvoiceListResponse>({
    queryKey: ['invoices', { page, search, status, sortBy, sortDir }],
    queryFn: async () => {
      const res = await apiClient.get<Invoice[]>('/invoices', {
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
  const columns: ColumnDef<Invoice>[] = useMemo(
    () => [
      {
        key: 'invoiceNumber',
        header: 'N. Fattura',
        sortable: true,
        cell: (row) => (
          <span className="font-semibold text-slate-900 dark:text-white">
            {row.invoiceNumber}
          </span>
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
        key: 'issueDate',
        header: 'Data',
        sortable: true,
        cell: (row) => (
          <span className="tabular-nums text-slate-500 dark:text-slate-400">
            {formatDate(row.issueDate)}
          </span>
        ),
      },
      {
        key: 'totalAmount',
        header: 'Importo',
        sortable: true,
        cell: (row) => (
          <span className="font-medium tabular-nums text-slate-900 dark:text-white">
            {formatCurrency(row.totalAmount)}
          </span>
        ),
      },
      {
        key: 'dueDate',
        header: 'Scadenza',
        sortable: true,
        cell: (row) => {
          const isOverdue = new Date(row.dueDate) < new Date() && row.status !== 'paid';
          return (
            <span
              className={cn(
                'tabular-nums',
                isOverdue
                  ? 'font-semibold text-red-600 dark:text-red-400'
                  : 'text-slate-500 dark:text-slate-400',
              )}
            >
              {formatDate(row.dueDate)}
            </span>
          );
        },
      },
      {
        key: 'status',
        header: 'Stato',
        cell: (row) => (
          <Badge variant={(STATUS_VARIANT[row.status] as any) || 'neutral'}>
            {STATUS_LABEL[row.status] || row.status}
          </Badge>
        ),
      },
      {
        key: 'ocrConfidence',
        header: 'OCR',
        width: '60px',
        cell: (row) => (
          <div className="flex items-center justify-center">
            <OcrDot confidence={row.ocrConfidence} />
          </div>
        ),
      },
      {
        key: 'isReconciled',
        header: 'Ric.',
        width: '60px',
        cell: (row) => (
          <div className="flex items-center justify-center">
            {row.isReconciled ? (
              <Link2 className="h-4 w-4 text-green-500" />
            ) : (
              <span className="text-slate-300 dark:text-slate-600">-</span>
            )}
          </div>
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
          Errore nel caricamento delle fatture.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Riprova
        </Button>
      </motion.div>
    );
  }

  const invoices = data?.data ?? [];
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
          <FileText className="h-7 w-7 text-accent-green" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Fatture
          </h1>
          {pagination && (
            <Badge variant="neutral">{pagination.total}</Badge>
          )}
        </div>
        <Button
          variant="primary"
          icon={<Upload className="h-4 w-4" />}
          onClick={() => navigate('/invoices/upload')}
        >
          Carica Fattura
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
          placeholder="Cerca per numero fattura o fornitore..."
          className="sm:w-96"
        />
      </div>

      {/* Table */}
      {!isLoading && invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nessuna fattura trovata"
          description={
            search || status
              ? 'Prova a modificare i filtri di ricerca.'
              : 'Carica la prima fattura per iniziare.'
          }
          actionLabel={!search && !status ? 'Carica Fattura' : undefined}
          onAction={
            !search && !status ? () => navigate('/invoices/upload') : undefined
          }
        />
      ) : (
        <DataTable<Invoice>
          columns={columns}
          data={invoices}
          loading={isLoading}
          sortKey={sortBy}
          sortDirection={sortDir}
          onSort={handleSort}
          onRowClick={(row) => navigate(`/invoices/${row.id}`)}
          emptyMessage="Nessuna fattura trovata"
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

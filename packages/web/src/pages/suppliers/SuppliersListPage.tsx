import { useMemo, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Building2, Plus } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatDate } from '@/utils/format-date';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  SearchInput,
  Select,
  type ColumnDef,
} from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Supplier {
  id: string;
  businessName: string;
  vatNumber: string;
  category: string;
  activeProducts: number;
  score: number | null;
  lastOrderDate: string | null;
}

interface SupplierListResponse {
  data: Supplier[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface CategoryCount {
  category: string;
  count: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const CATEGORY_COLORS: Record<string, 'success' | 'info' | 'error' | 'warning' | 'neutral' | 'approved' | 'sent' | 'confirmed'> = {
  Ortofrutta: 'success',
  Ittico: 'info',
  Carni: 'error',
  Latticini: 'warning',
  Beverage: 'approved',
  Secco: 'sent',
  'Non Food': 'neutral',
  Altro: 'neutral',
};

function scoreBadge(score: number | null) {
  if (score === null || score === undefined) {
    return <Badge variant="neutral">N/D</Badge>;
  }
  if (score > 80) return <Badge variant="success">{score}</Badge>;
  if (score >= 50) return <Badge variant="warning">{score}</Badge>;
  return <Badge variant="error">{score}</Badge>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuppliersListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') || '1');
  const search = searchParams.get('q') || '';
  const category = searchParams.get('category') || '';
  const sortBy = searchParams.get('sortBy') || 'businessName';
  const sortDir = (searchParams.get('sortDir') as 'asc' | 'desc') || 'asc';

  /* --- Set URL params helper --- */
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

  /* --- Queries --- */
  const queryKey = ['suppliers', { page, search, category, sortBy, sortDir }];

  const { data, isLoading, isError, refetch } = useQuery<SupplierListResponse>({
    queryKey,
    queryFn: async () => {
      const res = await apiClient.get<Supplier[]>('/suppliers', {
        page,
        pageSize: 15,
        q: search || undefined,
        category: category || undefined,
        sortBy,
        sortDir,
      });
      return { data: res.data, pagination: res.pagination! };
    },
    placeholderData: (prev) => prev,
  });

  const { data: categoriesData } = useQuery<CategoryCount[]>({
    queryKey: ['suppliers', 'categories'],
    queryFn: async () => {
      const res = await apiClient.get<CategoryCount[]>('/suppliers/categories');
      return res.data;
    },
    staleTime: 60_000,
  });

  const categoryOptions = useMemo(() => {
    const opts = [{ value: '', label: 'Tutte le categorie' }];
    if (categoriesData) {
      for (const c of categoriesData) {
        opts.push({ value: c.category, label: `${c.category} (${c.count})` });
      }
    }
    return opts;
  }, [categoriesData]);

  /* --- Table columns --- */
  const columns: ColumnDef<Supplier>[] = useMemo(
    () => [
      {
        key: 'businessName',
        header: 'Ragione Sociale',
        sortable: true,
        cell: (row) => (
          <Link
            to={`/suppliers/${row.id}`}
            className="font-semibold text-slate-900 hover:text-accent-green dark:text-white dark:hover:text-accent-green"
            onClick={(e) => e.stopPropagation()}
          >
            {row.businessName}
          </Link>
        ),
      },
      {
        key: 'vatNumber',
        header: 'P.IVA',
        cell: (row) => (
          <span className="text-slate-400">{row.vatNumber || '-'}</span>
        ),
      },
      {
        key: 'category',
        header: 'Categoria',
        sortable: true,
        cell: (row) => (
          <Badge variant={CATEGORY_COLORS[row.category] || 'neutral'}>
            {row.category}
          </Badge>
        ),
      },
      {
        key: 'activeProducts',
        header: 'Prodotti Attivi',
        cell: (row) => (
          <span className="tabular-nums">{row.activeProducts}</span>
        ),
      },
      {
        key: 'score',
        header: 'Score',
        sortable: true,
        cell: (row) => scoreBadge(row.score),
      },
      {
        key: 'lastOrderDate',
        header: 'Ultimo Ordine',
        sortable: true,
        cell: (row) => (
          <span className="text-slate-500 dark:text-slate-400">
            {row.lastOrderDate ? formatDate(row.lastOrderDate) : '-'}
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

  /* --- Error state --- */
  if (isError) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20"
      >
        <p className="mb-4 text-sm text-red-700 dark:text-red-300">
          Errore nel caricamento dei fornitori.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Riprova
        </Button>
      </motion.div>
    );
  }

  const suppliers = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* --- Header --- */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7 text-accent-green" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Fornitori
          </h1>
          {pagination && (
            <Badge variant="neutral">{pagination.total}</Badge>
          )}
        </div>
        <Button
          variant="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => navigate('/suppliers/new')}
        >
          Nuovo Fornitore
        </Button>
      </div>

      {/* --- Filters --- */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput
          value={search}
          onChange={(v) => setParam('q', v)}
          placeholder="Cerca per nome o P.IVA..."
          className="sm:w-80"
        />
        <Select
          options={categoryOptions}
          value={category}
          onChange={(v) => setParam('category', v as string)}
          placeholder="Tutte le categorie"
          className="sm:w-56"
        />
      </div>

      {/* --- Table / Empty --- */}
      {!isLoading && suppliers.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nessun fornitore trovato"
          description={
            search || category
              ? 'Prova a modificare i filtri di ricerca.'
              : 'Aggiungi il primo fornitore per iniziare.'
          }
          actionLabel={!search && !category ? 'Nuovo Fornitore' : undefined}
          onAction={
            !search && !category
              ? () => navigate('/suppliers/new')
              : undefined
          }
        />
      ) : (
        <DataTable<Supplier>
          columns={columns}
          data={suppliers}
          loading={isLoading}
          sortKey={sortBy}
          sortDirection={sortDir}
          onSort={handleSort}
          onRowClick={(row) => navigate(`/suppliers/${row.id}`)}
          emptyMessage="Nessun fornitore trovato"
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

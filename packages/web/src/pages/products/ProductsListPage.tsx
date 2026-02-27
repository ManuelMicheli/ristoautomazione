import { useMemo, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Package,
  Plus,
  Upload,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatCurrency } from '@/utils/format-currency';
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
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  certifications: string[];
  supplierCount: number;
  bestPrice: number | null;
  bestPriceSupplier: string | null;
  priceTrend: 'up' | 'down' | 'stable' | null;
}

interface ProductListResponse {
  data: Product[];
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

const CATEGORY_OPTIONS = [
  { value: '', label: 'Tutte le categorie' },
  { value: 'Ortofrutta', label: 'Ortofrutta' },
  { value: 'Ittico', label: 'Ittico' },
  { value: 'Carni', label: 'Carni' },
  { value: 'Latticini', label: 'Latticini' },
  { value: 'Beverage', label: 'Beverage' },
  { value: 'Secco', label: 'Secco' },
  { value: 'Non Food', label: 'Non Food' },
  { value: 'Altro', label: 'Altro' },
];

const CATEGORY_COLORS: Record<string, 'success' | 'info' | 'error' | 'warning' | 'neutral' | 'approved' | 'sent'> = {
  Ortofrutta: 'success',
  Ittico: 'info',
  Carni: 'error',
  Latticini: 'warning',
  Beverage: 'approved',
  Secco: 'sent',
  'Non Food': 'neutral',
  Altro: 'neutral',
};

const CERT_BADGES = ['BIO', 'DOP', 'IGP'] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'stable' | null }) {
  if (!trend || trend === 'stable') {
    return <Minus className="h-4 w-4 text-slate-400" />;
  }
  if (trend === 'up') {
    return <ArrowUp className="h-4 w-4 text-accent-red" />;
  }
  return <ArrowDown className="h-4 w-4 text-accent-green" />;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProductsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') || '1');
  const search = searchParams.get('q') || '';
  const category = searchParams.get('category') || '';
  const certification = searchParams.get('cert') || '';
  const sortBy = searchParams.get('sortBy') || 'name';
  const sortDir = (searchParams.get('sortDir') as 'asc' | 'desc') || 'asc';

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

  const toggleCert = useCallback(
    (cert: string) => {
      setParam('cert', certification === cert ? '' : cert);
    },
    [certification, setParam],
  );

  /* --- Query --- */
  const { data, isLoading, isError, refetch } = useQuery<ProductListResponse>({
    queryKey: ['products', { page, search, category, certification, sortBy, sortDir }],
    queryFn: async () => {
      const res = await apiClient.get<Product[]>('/products', {
        page,
        pageSize: 20,
        q: search || undefined,
        category: category || undefined,
        certification: certification || undefined,
        sortBy,
        sortDir,
      });
      return { data: res.data, pagination: res.pagination! };
    },
    placeholderData: (prev) => prev,
  });

  /* --- Columns --- */
  const columns: ColumnDef<Product>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Nome',
        sortable: true,
        cell: (row) => (
          <div>
            <Link
              to={`/products/${row.id}`}
              className="font-semibold text-slate-900 hover:text-accent-green dark:text-white dark:hover:text-accent-green"
              onClick={(e) => e.stopPropagation()}
            >
              {row.name}
            </Link>
            {row.certifications && row.certifications.length > 0 && (
              <div className="mt-1 flex gap-1">
                {row.certifications.map((c) => (
                  <Badge key={c} variant="success" size="sm">
                    {c}
                  </Badge>
                ))}
              </div>
            )}
          </div>
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
        key: 'unit',
        header: 'Unita',
        cell: (row) => (
          <Badge variant="neutral" size="sm">
            {row.unit}
          </Badge>
        ),
      },
      {
        key: 'supplierCount',
        header: 'N. Fornitori',
        cell: (row) => (
          <span className="tabular-nums">{row.supplierCount}</span>
        ),
      },
      {
        key: 'bestPrice',
        header: 'Miglior Prezzo',
        sortable: true,
        cell: (row) =>
          row.bestPrice !== null ? (
            <div>
              <span className="font-medium tabular-nums text-slate-900 dark:text-white">
                {formatCurrency(row.bestPrice)}
              </span>
              {row.bestPriceSupplier && (
                <p className="text-xs text-slate-400">{row.bestPriceSupplier}</p>
              )}
            </div>
          ) : (
            <span className="text-slate-400">-</span>
          ),
      },
      {
        key: 'priceTrend',
        header: 'Trend',
        cell: (row) => <TrendIcon trend={row.priceTrend} />,
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
          Errore nel caricamento dei prodotti.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Riprova
        </Button>
      </motion.div>
    );
  }

  const products = data?.data ?? [];
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
          <Package className="h-7 w-7 text-accent-green" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Catalogo Prodotti
          </h1>
          {pagination && (
            <Badge variant="neutral">{pagination.total}</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            icon={<Upload className="h-4 w-4" />}
            onClick={() => navigate('/products/import')}
          >
            Importa Listino
          </Button>
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => navigate('/products/new')}
          >
            Nuovo Prodotto
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={(v) => setParam('q', v)}
          placeholder="Cerca prodotto..."
          className="sm:w-80"
        />
        <Select
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={(v) => setParam('category', v as string)}
          placeholder="Tutte le categorie"
          className="sm:w-56"
        />
        <div className="flex gap-1.5">
          {CERT_BADGES.map((cert) => (
            <Button
              key={cert}
              variant={certification === cert ? 'primary' : 'outline'}
              size="sm"
              onClick={() => toggleCert(cert)}
            >
              {cert}
            </Button>
          ))}
        </div>
      </div>

      {/* Table / Empty */}
      {!isLoading && products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nessun prodotto trovato"
          description={
            search || category || certification
              ? 'Prova a modificare i filtri di ricerca.'
              : 'Aggiungi il primo prodotto per iniziare.'
          }
          actionLabel={!search && !category ? 'Nuovo Prodotto' : undefined}
          onAction={
            !search && !category
              ? () => navigate('/products/new')
              : undefined
          }
        />
      ) : (
        <DataTable<Product>
          columns={columns}
          data={products}
          loading={isLoading}
          sortKey={sortBy}
          sortDirection={sortDir}
          onSort={handleSort}
          onRowClick={(row) => navigate(`/products/${row.id}`)}
          emptyMessage="Nessun prodotto trovato"
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

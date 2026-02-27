import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Package,
  Pencil,
  Trash2,
  MoreVertical,
  Plus,
  Trophy,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { apiClient } from '@/services/api-client';
import { formatCurrency } from '@/utils/format-currency';
import { formatDate } from '@/utils/format-date';
import { cn } from '@/utils/cn';
import {
  Badge,
  Button,
  Card,
  DataTable,
  DropdownMenu,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  Tabs,
  useToast,
  type ColumnDef,
  type TabItem,
} from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProductDetail {
  id: string;
  name: string;
  category: string;
  unit: string;
  weightFormat: string;
  internalCode: string;
  allergens: string[];
  certifications: string[];
  bio: boolean;
  dop: boolean;
  igp: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SupplierPrice {
  id: string;
  supplierId: string;
  supplierName: string;
  price: number;
  unit: string;
  lastUpdated: string;
  isBestPrice: boolean;
}

interface PriceHistoryPoint {
  date: string;
  [supplierName: string]: string | number;
}

interface AddSupplierPriceForm {
  supplierId: string;
  price: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TAB_ITEMS: TabItem[] = [
  { value: 'prices', label: 'Prezzi' },
  { value: 'history', label: 'Storico Prezzi' },
  { value: 'info', label: 'Informazioni' },
];

const CATEGORY_OPTIONS = [
  { value: 'Ortofrutta', label: 'Ortofrutta' },
  { value: 'Ittico', label: 'Ittico' },
  { value: 'Carni', label: 'Carni' },
  { value: 'Latticini', label: 'Latticini' },
  { value: 'Beverage', label: 'Beverage' },
  { value: 'Secco', label: 'Secco' },
  { value: 'Non Food', label: 'Non Food' },
  { value: 'Altro', label: 'Altro' },
];

const UNIT_OPTIONS = [
  { value: 'kg', label: 'Kg' },
  { value: 'lt', label: 'Lt' },
  { value: 'pz', label: 'Pz' },
  { value: 'ct', label: 'Cartone' },
  { value: 'cf', label: 'Confezione' },
];

const ALLERGENS = [
  'Glutine', 'Crostacei', 'Uova', 'Pesce', 'Arachidi', 'Soia',
  'Latte', 'Frutta a guscio', 'Sedano', 'Senape', 'Sesamo',
  'Anidride solforosa', 'Lupini', 'Molluschi',
];

const LINE_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16',
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/* -- Prices Tab -- */
function PricesTab({ productId }: { productId: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: prices = [], isLoading } = useQuery<SupplierPrice[]>({
    queryKey: ['product', productId, 'prices'],
    queryFn: async () => {
      const res = await apiClient.get<SupplierPrice[]>(`/products/${productId}/prices`);
      return res.data;
    },
  });

  const { data: suppliers = [] } = useQuery<{ id: string; businessName: string }[]>({
    queryKey: ['suppliers', 'list-simple'],
    queryFn: async () => {
      const res = await apiClient.get<{ id: string; businessName: string }[]>('/suppliers', {
        pageSize: 200,
      });
      return res.data;
    },
    enabled: modalOpen,
  });

  const addPriceMutation = useMutation({
    mutationFn: (data: AddSupplierPriceForm) =>
      apiClient.post(`/products/${productId}/prices`, data),
    onSuccess: () => {
      toast('Prezzo fornitore aggiunto', 'success');
      queryClient.invalidateQueries({ queryKey: ['product', productId, 'prices'] });
      setModalOpen(false);
    },
    onError: () => toast("Errore nell'aggiunta del prezzo", 'error'),
  });

  const [newSupplierId, setNewSupplierId] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const sortedPrices = useMemo(
    () => [...prices].sort((a, b) => a.price - b.price),
    [prices],
  );

  const columns: ColumnDef<SupplierPrice>[] = useMemo(
    () => [
      {
        key: 'supplierName',
        header: 'Fornitore',
        cell: (row) => (
          <div className="flex items-center gap-2">
            {row.isBestPrice && <Trophy className="h-4 w-4 text-amber-500" />}
            <Link
              to={`/suppliers/${row.supplierId}`}
              className="font-medium text-slate-900 hover:text-accent-green dark:text-white"
              onClick={(e) => e.stopPropagation()}
            >
              {row.supplierName}
            </Link>
          </div>
        ),
      },
      {
        key: 'price',
        header: 'Prezzo',
        cell: (row) => (
          <span
            className={cn(
              'font-medium tabular-nums',
              row.isBestPrice
                ? 'text-accent-green'
                : 'text-slate-900 dark:text-white',
            )}
          >
            {formatCurrency(row.price)}
          </span>
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
        key: 'lastUpdated',
        header: 'Ultimo Aggiornamento',
        cell: (row) => (
          <span className="text-slate-500">{formatDate(row.lastUpdated)}</span>
        ),
      },
    ],
    [],
  );

  if (isLoading) {
    return <Skeleton variant="rect" height={200} />;
  }

  const supplierOptions = suppliers.map((s) => ({
    value: s.id,
    label: s.businessName,
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
          Aggiungi Fornitore
        </Button>
      </div>

      {sortedPrices.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nessun prezzo disponibile"
          description="Aggiungi un fornitore con il relativo prezzo."
        />
      ) : (
        <DataTable columns={columns} data={sortedPrices} />
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Aggiungi Prezzo Fornitore"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Annulla
            </Button>
            <Button
              loading={addPriceMutation.isPending}
              onClick={() =>
                addPriceMutation.mutate({
                  supplierId: newSupplierId,
                  price: parseFloat(newPrice),
                })
              }
              disabled={!newSupplierId || !newPrice}
            >
              Aggiungi
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Fornitore *"
            options={supplierOptions}
            value={newSupplierId}
            onChange={(v) => setNewSupplierId(v as string)}
            placeholder="Seleziona fornitore"
          />
          <Input
            label="Prezzo (EUR) *"
            type="number"
            min={0}
            step={0.01}
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}

/* -- Price History Tab -- */
function PriceHistoryTab({ productId }: { productId: string }) {
  const [period, setPeriod] = useState<'3M' | '6M' | '1A'>('6M');

  const periodMonths = period === '3M' ? 3 : period === '6M' ? 6 : 12;

  const { data: historyData, isLoading } = useQuery<PriceHistoryPoint[]>({
    queryKey: ['price-history', productId, period],
    queryFn: async () => {
      const res = await apiClient.get<PriceHistoryPoint[]>(
        `/products/${productId}/price-history`,
        { months: periodMonths },
      );
      return res.data;
    },
  });

  if (isLoading) {
    return <Skeleton variant="rect" height={400} />;
  }

  const chartData = historyData ?? [];

  // Extract supplier names from data keys (excluding 'date')
  const supplierNames = chartData.length > 0
    ? Object.keys(chartData[0]!).filter((k) => k !== 'date')
    : [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-1.5">
        {(['3M', '6M', '1A'] as const).map((p) => (
          <Button
            key={p}
            variant={period === p ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {p}
          </Button>
        ))}
      </div>

      {chartData.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nessuno storico prezzi"
          description="I dati storici dei prezzi appariranno qui."
        />
      ) : (
        <Card>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => {
                  const d = new Date(v);
                  return d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
                }}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => `${v.toFixed(2)}`}
              />
              <RechartsTooltip
                formatter={(value: number) => formatCurrency(value)}
                labelFormatter={(label) => formatDate(label as string)}
              />
              <Legend />
              {supplierNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

/* -- Info Tab -- */
function InfoTab({
  product,
  onUpdate,
}: {
  product: ProductDetail;
  onUpdate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const editSchema = z.object({
    name: z.string().min(1, 'Nome obbligatorio'),
    category: z.string().optional(),
    unit: z.string().optional(),
    weightFormat: z.string().optional(),
    internalCode: z.string().optional(),
    bio: z.boolean(),
    dop: z.boolean(),
    igp: z.boolean(),
  });

  type EditForm = z.infer<typeof editSchema>;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: product.name,
      category: product.category,
      unit: product.unit,
      weightFormat: product.weightFormat || '',
      internalCode: product.internalCode || '',
      bio: product.bio,
      dop: product.dop,
      igp: product.igp,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: EditForm) =>
      apiClient.put(`/products/${product.id}`, data),
    onSuccess: () => {
      toast('Prodotto aggiornato', 'success');
      queryClient.invalidateQueries({ queryKey: ['product', product.id] });
      setEditing(false);
      onUpdate();
    },
    onError: () => toast('Errore nel salvataggio', 'error'),
  });

  if (editing) {
    return (
      <Card>
        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nome *"
              error={errors.name?.message}
              {...register('name')}
            />
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Select
                  label="Categoria"
                  options={CATEGORY_OPTIONS}
                  value={field.value || ''}
                  onChange={(v) => field.onChange(v as string)}
                />
              )}
            />
            <Controller
              control={control}
              name="unit"
              render={({ field }) => (
                <Select
                  label="Unita di Misura"
                  options={UNIT_OPTIONS}
                  value={field.value || ''}
                  onChange={(v) => field.onChange(v as string)}
                />
              )}
            />
            <Input label="Formato Peso" {...register('weightFormat')} />
            <Input label="Codice Interno" {...register('internalCode')} />
          </div>
          <div className="flex flex-wrap gap-4">
            <Controller
              control={control}
              name="bio"
              render={({ field }) => (
                <Switch label="BIO" checked={field.value} onChange={field.onChange} />
              )}
            />
            <Controller
              control={control}
              name="dop"
              render={({ field }) => (
                <Switch label="DOP" checked={field.value} onChange={field.onChange} />
              )}
            />
            <Controller
              control={control}
              name="igp"
              render={({ field }) => (
                <Switch label="IGP" checked={field.value} onChange={field.onChange} />
              )}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isSubmitting}>
              Salva Modifiche
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                reset();
                setEditing(false);
              }}
            >
              Annulla
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <InfoField label="Nome" value={product.name} />
        <InfoField label="Categoria" value={product.category || '-'} />
        <InfoField label="Unita di Misura" value={product.unit || '-'} />
        <InfoField label="Formato Peso" value={product.weightFormat || '-'} />
        <InfoField label="Codice Interno" value={product.internalCode || '-'} />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Certificazioni
          </p>
          <div className="mt-1 flex gap-1.5">
            {product.bio && <Badge variant="success">BIO</Badge>}
            {product.dop && <Badge variant="info">DOP</Badge>}
            {product.igp && <Badge variant="warning">IGP</Badge>}
            {!product.bio && !product.dop && !product.igp && (
              <span className="text-sm text-slate-500">Nessuna</span>
            )}
          </div>
        </div>
        {product.allergens && product.allergens.length > 0 && (
          <div className="sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Allergeni
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {product.allergens.map((a) => (
                <Badge key={a} variant="error" size="sm">
                  {a}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <InfoField label="Creato il" value={formatDate(product.createdAt)} />
        <InfoField label="Aggiornato il" value={formatDate(product.updatedAt)} />
      </div>
      <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
        <Button
          variant="outline"
          icon={<Pencil className="h-4 w-4" />}
          onClick={() => setEditing(true)}
        >
          Modifica
        </Button>
      </div>
    </Card>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('prices');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const { data: product, isLoading, isError, refetch } = useQuery<ProductDetail>({
    queryKey: ['product', id],
    queryFn: async () => {
      const res = await apiClient.get<ProductDetail>(`/products/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.del(`/products/${id}`),
    onSuccess: () => {
      toast('Prodotto eliminato', 'success');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate('/products');
    },
    onError: () => toast("Errore nell'eliminazione del prodotto", 'error'),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" width="40%" height={32} />
        <Skeleton variant="rect" height={200} />
      </div>
    );
  }

  if (isError || !product) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20"
      >
        <p className="mb-4 text-sm text-red-700 dark:text-red-300">
          Errore nel caricamento del prodotto.
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
      className="space-y-6"
    >
      {/* Back */}
      <Link
        to="/products"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-accent-green"
      >
        <ArrowLeft className="h-4 w-4" />
        Prodotti
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {product.name}
          </h1>
          {product.category && (
            <Badge variant="info">{product.category}</Badge>
          )}
          {product.unit && (
            <Badge variant="neutral">{product.unit}</Badge>
          )}
          {product.bio && <Badge variant="success">BIO</Badge>}
          {product.dop && <Badge variant="info">DOP</Badge>}
          {product.igp && <Badge variant="warning">IGP</Badge>}
        </div>
        <DropdownMenu
          trigger={
            <Button variant="outline" icon={<MoreVertical className="h-4 w-4" />}>
              Azioni
            </Button>
          }
          items={[
            {
              label: 'Modifica',
              icon: <Pencil className="h-4 w-4" />,
              onClick: () => setActiveTab('info'),
            },
            { divider: true, label: '' },
            {
              label: 'Elimina',
              icon: <Trash2 className="h-4 w-4" />,
              variant: 'danger',
              onClick: () => setDeleteModalOpen(true),
            },
          ]}
        />
      </div>

      {/* Tabs */}
      <Tabs tabs={TAB_ITEMS} value={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      <div className="min-h-[300px]">
        {activeTab === 'prices' && <PricesTab productId={product.id} />}
        {activeTab === 'history' && <PriceHistoryTab productId={product.id} />}
        {activeTab === 'info' && (
          <InfoTab product={product} onUpdate={() => refetch()} />
        )}
      </div>

      {/* Delete Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Elimina Prodotto"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>
              Annulla
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Elimina
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Sei sicuro di voler eliminare <strong>{product.name}</strong>?
          Questa azione non puo essere annullata.
        </p>
      </Modal>
    </motion.div>
  );
}

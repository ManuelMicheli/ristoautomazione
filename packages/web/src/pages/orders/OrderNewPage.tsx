import { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Search,
  Plus,
  Minus as MinusIcon,
  Trash2,
  Building2,
  Flame,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatCurrency } from '@/utils/format-currency';
import { formatDate } from '@/utils/format-date';
import { cn } from '@/utils/cn';
import {
  Badge,
  Button,
  Card,
  DatePicker,
  Input,
  SearchInput,
  Select,
  Switch,
  TextArea,
  useToast,
} from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SupplierOption {
  id: string;
  businessName: string;
  category: string;
  lastOrderDate: string | null;
}

interface SupplierProduct {
  id: string;
  name: string;
  category: string;
  unit: string;
  price: number;
}

interface OrderLineItem {
  productId: string;
  productName: string;
  unit: string;
  unitPrice: number;
  quantity: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STEPS = [
  { num: 1, label: 'Fornitore' },
  { num: 2, label: 'Prodotti' },
  { num: 3, label: 'Riepilogo' },
];

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

/* ------------------------------------------------------------------ */
/*  Step Indicator                                                     */
/* ------------------------------------------------------------------ */

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {STEPS.map((step, i) => (
        <div key={step.num} className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
              current > step.num
                ? 'bg-accent-green text-white'
                : current === step.num
                  ? 'bg-accent-green/10 text-accent-green ring-2 ring-accent-green'
                  : 'bg-slate-100 text-slate-400 dark:bg-slate-700',
            )}
          >
            {current > step.num ? <Check className="h-4 w-4" /> : step.num}
          </div>
          <span
            className={cn(
              'hidden text-sm sm:inline',
              current >= step.num
                ? 'font-medium text-slate-900 dark:text-white'
                : 'text-slate-400',
            )}
          >
            {step.label}
          </span>
          {i < STEPS.length - 1 && (
            <ChevronRight className="h-4 w-4 text-slate-300" />
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function OrderNewPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierOption | null>(null);
  const [lines, setLines] = useState<OrderLineItem[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [deliveryDate, setDeliveryDate] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);

  /* --- Step 1: Suppliers --- */
  const { data: suppliers = [] } = useQuery<SupplierOption[]>({
    queryKey: ['suppliers', 'order-select', supplierSearch],
    queryFn: async () => {
      const res = await apiClient.get<SupplierOption[]>('/suppliers', {
        pageSize: 20,
        q: supplierSearch || undefined,
      });
      return res.data;
    },
    enabled: step === 1,
  });

  /* --- Step 2: Products for supplier --- */
  const { data: products = [], isLoading: productsLoading } = useQuery<SupplierProduct[]>({
    queryKey: ['supplier-products', selectedSupplier?.id, productSearch, productCategory],
    queryFn: async () => {
      const res = await apiClient.get<SupplierProduct[]>(
        `/suppliers/${selectedSupplier!.id}/products`,
        {
          q: productSearch || undefined,
          category: productCategory || undefined,
          pageSize: 50,
        },
      );
      return res.data;
    },
    enabled: step === 2 && !!selectedSupplier,
  });

  /* --- Create order mutation --- */
  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post<{ id: string }>('/orders', {
        supplierId: selectedSupplier!.id,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        expectedDeliveryDate: deliveryDate?.toISOString(),
        notes,
        isUrgent,
      }),
    onSuccess: (res) => {
      toast('Ordine creato con successo', 'success');
      navigate(`/orders/${res.data.id}`);
    },
    onError: () => toast("Errore nella creazione dell'ordine", 'error'),
  });

  /* --- Handlers --- */
  const addProduct = useCallback((product: SupplierProduct) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          unit: product.unit,
          unitPrice: product.price,
          quantity: 1,
        },
      ];
    });
  }, []);

  const updateQuantity = useCallback((productId: string, delta: number) => {
    setLines((prev) =>
      prev
        .map((l) =>
          l.productId === productId
            ? { ...l, quantity: Math.max(0, l.quantity + delta) }
            : l,
        )
        .filter((l) => l.quantity > 0),
    );
  }, []);

  const removeLine = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const orderTotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    [lines],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto max-w-5xl space-y-6"
    >
      <Link
        to="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-accent-green"
      >
        <ArrowLeft className="h-4 w-4" />
        Ordini
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        Nuovo Ordine
      </h1>

      <StepIndicator current={step} />

      {/* ===== Step 1: Select Supplier ===== */}
      {step === 1 && (
        <div className="space-y-4">
          <SearchInput
            value={supplierSearch}
            onChange={setSupplierSearch}
            placeholder="Cerca fornitore per nome..."
            className="sm:w-96"
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map((supplier) => (
              <Card
                key={supplier.id}
                hoverable
                onClick={() => {
                  setSelectedSupplier(supplier);
                  setStep(2);
                }}
                className={cn(
                  selectedSupplier?.id === supplier.id &&
                    'ring-2 ring-accent-green',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
                    <Building2 className="h-5 w-5 text-slate-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {supplier.businessName}
                    </p>
                    <Badge variant="neutral" size="sm" className="mt-1">
                      {supplier.category}
                    </Badge>
                    {supplier.lastOrderDate && (
                      <p className="mt-1 text-xs text-slate-400">
                        Ultimo ordine: {formatDate(supplier.lastOrderDate)}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {suppliers.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">
              Nessun fornitore trovato.
            </p>
          )}
        </div>
      )}

      {/* ===== Step 2: Add Products ===== */}
      {step === 2 && selectedSupplier && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left: Product search + list */}
          <div className="space-y-4 lg:col-span-3">
            <Card
              header={
                <div className="flex items-center justify-between">
                  <span>Prodotti di {selectedSupplier.businessName}</span>
                  <Badge variant="neutral">{products.length}</Badge>
                </div>
              }
            >
              <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                <SearchInput
                  value={productSearch}
                  onChange={setProductSearch}
                  placeholder="Cerca prodotto..."
                  className="flex-1"
                />
                <Select
                  options={CATEGORY_OPTIONS}
                  value={productCategory}
                  onChange={(v) => setProductCategory(v as string)}
                  className="sm:w-48"
                />
              </div>

              {productsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700"
                    />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  Nessun prodotto trovato per questo fornitore.
                </p>
              ) : (
                <div className="max-h-[500px] space-y-1.5 overflow-y-auto">
                  {products.map((product) => {
                    const inCart = lines.find((l) => l.productId === product.id);
                    return (
                      <div
                        key={product.id}
                        className={cn(
                          'flex items-center justify-between rounded-lg border p-3',
                          inCart
                            ? 'border-accent-green/30 bg-accent-green/5'
                            : 'border-slate-200 dark:border-slate-700',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 dark:text-white">
                            {product.name}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                            <Badge variant="neutral" size="sm">{product.unit}</Badge>
                            <span>{formatCurrency(product.price)}</span>
                          </div>
                        </div>
                        {inCart ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-600"
                              onClick={() => updateQuantity(product.id, -1)}
                            >
                              <MinusIcon className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-8 text-center text-sm font-medium tabular-nums">
                              {inCart.quantity}
                            </span>
                            <button
                              type="button"
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-600"
                              onClick={() => updateQuantity(product.id, 1)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<Plus className="h-3.5 w-3.5" />}
                            onClick={() => addProduct(product)}
                          >
                            Aggiungi
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Right: Order summary */}
          <div className="space-y-4 lg:col-span-2">
            <Card header="Riepilogo Ordine">
              {lines.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  Aggiungi prodotti per iniziare.
                </p>
              ) : (
                <div className="space-y-2">
                  {lines.map((line) => (
                    <div
                      key={line.productId}
                      className="flex items-center justify-between rounded-lg border border-slate-100 p-2 dark:border-slate-700"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {line.productName}
                        </p>
                        <p className="text-xs text-slate-400">
                          {line.quantity} {line.unit} x {formatCurrency(line.unitPrice)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium tabular-nums">
                          {formatCurrency(line.unitPrice * line.quantity)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeLine(line.productId)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-accent-red dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500">Totale</span>
                      <span className="text-lg font-bold text-slate-900 dark:text-white">
                        {formatCurrency(orderTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </Card>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Indietro
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={lines.length === 0}
              >
                Continua
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Step 3: Review + Submit ===== */}
      {step === 3 && selectedSupplier && (
        <div className="space-y-6">
          <Card header="Riepilogo Ordine">
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase text-slate-400">Fornitore</p>
                <p className="mt-1 font-medium text-slate-900 dark:text-white">
                  {selectedSupplier.businessName}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-400">Articoli</p>
                <p className="mt-1 font-medium text-slate-900 dark:text-white">
                  {lines.length} prodotti
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">
                      Prodotto
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">
                      Quantita
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium uppercase text-slate-500">
                      UM
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">
                      Prezzo
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">
                      Totale
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr
                      key={line.productId}
                      className="border-b border-slate-100 dark:border-slate-700/50"
                    >
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                        {line.productName}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td>
                      <td className="px-3 py-2 text-center">{line.unit}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(line.unitPrice)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatCurrency(line.unitPrice * line.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                    <td
                      colSpan={4}
                      className="px-3 py-3 text-right font-medium text-slate-500"
                    >
                      Totale Ordine
                    </td>
                    <td className="px-3 py-3 text-right text-lg font-bold text-slate-900 dark:text-white">
                      {formatCurrency(orderTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card header="Dettagli Consegna">
            <div className="grid gap-4 sm:grid-cols-2">
              <DatePicker
                label="Data Consegna Prevista"
                value={deliveryDate}
                onChange={setDeliveryDate}
                placeholder="Seleziona data"
              />
              <div className="flex items-end">
                <Switch
                  label="Ordine Urgente"
                  checked={isUrgent}
                  onChange={setIsUrgent}
                />
              </div>
            </div>
            <div className="mt-4">
              <TextArea
                label="Note"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Note aggiuntive per il fornitore..."
              />
            </div>
          </Card>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Indietro
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              icon={<Check className="h-4 w-4" />}
            >
              Crea Ordine
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

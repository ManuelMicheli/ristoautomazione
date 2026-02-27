import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Badge,
  Button,
  Card,
  DatePicker,
  EmptyState,
  FileUpload,
  Input,
  Modal,
  SearchInput,
  TextArea,
  useToast,
} from '@/components/ui';
import { apiClient } from '@/services/api-client';
import {
  ShoppingCart,
  Upload,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Plus,
  Minus,
  TrendingDown,
  Package,
  Truck,
  FileText,
  ChevronLeft,
  Save,
  Search,
} from 'lucide-react';

// ---------- Types ----------

interface ShoppingItem {
  productId: string;
  productName: string;
  productUnit: string | null;
  category: string | null;
  quantity: number;
}

interface OptimizedLineItem {
  productId: string;
  productName: string;
  productUnit: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  supplierProductId: string;
}

interface OptimizedOrder {
  supplierId: string;
  supplierName: string;
  minimumOrderAmount: number | null;
  items: OptimizedLineItem[];
  subtotal: number;
  warnings: string[];
}

interface OptimizeResult {
  orders: OptimizedOrder[];
  totalAmount: number;
  totalSavings: number;
  unassignedItems: Array<{
    productId: string;
    productName: string;
    reason: string;
  }>;
}

// ---------- Steps ----------

const STEPS = [
  { num: 1, label: 'Lista', icon: ShoppingCart },
  { num: 2, label: 'Ottimizzazione', icon: Sparkles },
  { num: 3, label: 'Riepilogo', icon: FileText },
  { num: 4, label: 'Conferma', icon: CheckCircle },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const isActive = s.num === current;
        const isDone = s.num < current;
        return (
          <React.Fragment key={s.num}>
            {i > 0 && (
              <div
                className={`h-px w-8 ${isDone ? 'bg-green-500' : 'bg-slate-700'}`}
              />
            )}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/50'
                  : isDone
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-slate-800 text-slate-500'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------- Main Page ----------

export default function ShoppingListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Wizard state
  const [step, setStep] = useState(1);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [deliveryDate, setDeliveryDate] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(
    null,
  );
  const [createdOrderIds, setCreatedOrderIds] = useState<string[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateFrequency, setTemplateFrequency] = useState('weekly');
  const [inputMode, setInputMode] = useState<'search' | 'csv'>('search');

  // Handle template preload from navigation state
  useEffect(() => {
    const state = location.state as {
      templateId?: string;
      items?: Array<{ productId: string; quantity: number }>;
    } | null;
    if (state?.items && state.items.length > 0) {
      const loadItems = async () => {
        const enriched: ShoppingItem[] = [];
        for (const m of state.items!) {
          try {
            const prod = await apiClient.get<any>(`/products/${m.productId}`);
            enriched.push({
              productId: m.productId,
              productName: prod.data.name,
              productUnit: prod.data.unit,
              category: prod.data.category,
              quantity: m.quantity,
            });
          } catch {
            // Product may have been deleted, skip it
          }
        }
        setItems(enriched);
      };
      loadItems();
      window.history.replaceState({}, '');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Product search query
  const { data: searchResults } = useQuery({
    queryKey: ['products-search', productSearch],
    queryFn: () =>
      apiClient.get<any>('/products', { q: productSearch, pageSize: 20 }),
    enabled: productSearch.length >= 2,
  });

  // Optimize mutation
  const optimizeMutation = useMutation({
    mutationFn: (data: {
      items: Array<{ productId: string; quantity: number }>;
      desiredDeliveryDate?: string;
    }) => apiClient.post<OptimizeResult>('/shopping-list/optimize', data),
    onSuccess: (res) => {
      setOptimizeResult(res.data);
      setStep(3);
    },
    onError: () => {
      toast("Errore durante l'ottimizzazione", 'error');
      setStep(1);
    },
  });

  // Generate orders mutation
  const generateMutation = useMutation({
    mutationFn: (data: any) =>
      apiClient.post<{ orderIds: string[] }>(
        '/shopping-list/generate-orders',
        data,
      ),
    onSuccess: (res) => {
      setCreatedOrderIds(res.data.orderIds);
      setStep(4);
    },
    onError: () => {
      toast('Errore nella creazione degli ordini', 'error');
    },
  });

  // CSV upload mutation
  const csvMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.upload<{
        matched: Array<{ productId: string; quantity: number }>;
        unmatched: any[];
      }>('/shopping-list/from-csv', formData);
    },
    onSuccess: async (res) => {
      const enriched: ShoppingItem[] = [];
      for (const m of res.data.matched) {
        try {
          const prod = await apiClient.get<any>(`/products/${m.productId}`);
          enriched.push({
            productId: m.productId,
            productName: prod.data.name,
            productUnit: prod.data.unit,
            category: prod.data.category,
            quantity: m.quantity,
          });
        } catch {
          // skip
        }
      }
      setItems((prev) => [...prev, ...enriched]);

      if (res.data.unmatched.length > 0) {
        toast(`${res.data.unmatched.length} prodotti non trovati nel catalogo`, 'warning');
      }
      toast(`${res.data.matched.length} prodotti aggiunti dalla lista`);
    },
  });

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: (data: {
      name: string;
      frequency: string;
      items: Array<{ productId: string; quantity: number }>;
    }) => apiClient.post('/shopping-list/templates', data),
    onSuccess: () => {
      setShowSaveTemplate(false);
      toast('Template salvato');
    },
  });

  // ---------- Handlers ----------

  const addItem = useCallback((product: any) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          productUnit: product.unit,
          category: product.category,
          quantity: 1,
        },
      ];
    });
    setProductSearch('');
  }, []);

  const updateQuantity = useCallback((productId: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) => {
          if (i.productId !== productId) return i;
          const newQty = Math.max(0, i.quantity + delta);
          return { ...i, quantity: newQty };
        })
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const handleOptimize = () => {
    setStep(2);
    optimizeMutation.mutate({
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
      desiredDeliveryDate: deliveryDate
        ?.toISOString()
        .split('T')[0],
    });
  };

  const handleGenerate = () => {
    if (!optimizeResult) return;
    generateMutation.mutate({
      orders: optimizeResult.orders,
      deliveryDate: deliveryDate?.toISOString().split('T')[0],
      notes,
    });
  };

  const handleSaveTemplate = () => {
    saveTemplateMutation.mutate({
      name: templateName,
      frequency: templateFrequency,
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
    });
  };

  // ---------- Render ----------

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Lista della Spesa</h1>
          <p className="text-slate-400 mt-1">
            Aggiungi i prodotti, la piattaforma trova i prezzi migliori
          </p>
        </div>
      </div>

      <StepIndicator current={step} />

      <AnimatePresence mode="wait">
        {/* ---- STEP 1: Input ---- */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {/* Input mode toggle */}
            <div className="flex gap-2 mb-4">
              <Button
                variant={inputMode === 'search' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setInputMode('search')}
              >
                <Search className="w-4 h-4 mr-1" /> Cerca prodotti
              </Button>
              <Button
                variant={inputMode === 'csv' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setInputMode('csv')}
              >
                <Upload className="w-4 h-4 mr-1" /> Carica CSV
              </Button>
            </div>

            {inputMode === 'search' ? (
              <Card className="p-4 mb-4">
                <SearchInput
                  value={productSearch}
                  onChange={setProductSearch}
                  placeholder="Cerca prodotto per nome o codice..."
                />
                {searchResults?.data?.items &&
                  productSearch.length >= 2 && (
                    <div className="mt-2 max-h-60 overflow-y-auto divide-y divide-slate-800">
                      {searchResults.data.items.map((p: any) => (
                        <button
                          key={p.id}
                          onClick={() => addItem(p)}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800/50 rounded transition-colors text-left"
                        >
                          <div>
                            <span className="text-white font-medium">
                              {p.name}
                            </span>
                            {p.category && (
                              <Badge variant="neutral" className="ml-2 text-xs">
                                {p.category}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            {p.bestPrice && (
                              <span className="text-green-400">
                                &euro;{Number(p.bestPrice).toFixed(2)}/{p.unit}
                              </span>
                            )}
                            <Plus className="w-4 h-4 text-slate-400" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
              </Card>
            ) : (
              <Card className="p-4 mb-4">
                <p className="text-sm text-slate-400 mb-3">
                  Carica un file CSV con colonne: nome prodotto (o codice),
                  quantita
                </p>
                <FileUpload
                  accept=".csv,.txt"
                  onFiles={(files) =>
                    files[0] && csvMutation.mutate(files[0])
                  }
                />
              </Card>
            )}

            {/* Current list */}
            {items.length > 0 ? (
              <Card className="divide-y divide-slate-800">
                <div className="px-4 py-3 flex items-center justify-between">
                  <h3 className="font-semibold text-white">
                    <ShoppingCart className="w-4 h-4 inline mr-2" />
                    {items.length} prodotti nella lista
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSaveTemplate(true)}
                  >
                    <Save className="w-3.5 h-3.5 mr-1" /> Salva template
                  </Button>
                </div>
                {items.map((item) => (
                  <div
                    key={item.productId}
                    className="px-4 py-3 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <span className="text-white">{item.productName}</span>
                      {item.category && (
                        <Badge variant="neutral" className="ml-2 text-xs">
                          {item.category}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            updateQuantity(item.productId, -1)
                          }
                          className="p-1 rounded hover:bg-slate-700 text-slate-400"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val > 0) {
                              setItems((prev) =>
                                prev.map((i) =>
                                  i.productId === item.productId
                                    ? { ...i, quantity: val }
                                    : i,
                                ),
                              );
                            }
                          }}
                          className="w-20 text-center"
                        />
                        <button
                          onClick={() =>
                            updateQuantity(item.productId, 1)
                          }
                          className="p-1 rounded hover:bg-slate-700 text-slate-400"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-xs text-slate-500 w-8">
                        {item.productUnit ?? ''}
                      </span>
                      <button
                        onClick={() => removeItem(item.productId)}
                        className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </Card>
            ) : (
              <EmptyState
                icon={ShoppingCart}
                title="Lista vuota"
                description="Cerca un prodotto o carica un CSV per iniziare"
              />
            )}

            {/* Delivery date + Optimize button */}
            {items.length > 0 && (
              <div className="mt-6 flex items-end justify-between gap-4">
                <div className="flex-1 max-w-xs">
                  <label className="block text-sm text-slate-400 mb-1">
                    <Truck className="w-3.5 h-3.5 inline mr-1" />
                    Data consegna desiderata (opzionale)
                  </label>
                  <DatePicker value={deliveryDate} onChange={setDeliveryDate} />
                </div>
                <Button onClick={handleOptimize} size="lg">
                  <Sparkles className="w-5 h-5 mr-2" />
                  Ottimizza ({items.length} prodotti)
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* ---- STEP 2: Optimizing ---- */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mb-4" />
            <p className="text-white text-lg font-medium">
              Ottimizzazione in corso...
            </p>
            <p className="text-slate-400 mt-1">
              Analizzo {items.length} prodotti tra tutti i fornitori
            </p>
          </motion.div>
        )}

        {/* ---- STEP 3: Review ---- */}
        {step === 3 && optimizeResult && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {/* Summary stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-800">
                    <Package className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Totale Spesa</p>
                    <p className="text-xl font-bold text-white">
                      &euro;{optimizeResult.totalAmount.toFixed(2)}
                    </p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <TrendingDown className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Risparmio</p>
                    <p className="text-xl font-bold text-green-400">
                      &euro;{optimizeResult.totalSavings.toFixed(2)}
                    </p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-800">
                    <Truck className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Fornitori</p>
                    <p className="text-xl font-bold text-white">
                      {optimizeResult.orders.length}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Unassigned items warning */}
            {optimizeResult.unassignedItems.length > 0 && (
              <Card className="p-4 mb-4 border-amber-500/30 bg-amber-500/5">
                <h4 className="text-amber-400 font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {optimizeResult.unassignedItems.length} prodotti non
                  assegnabili
                </h4>
                <ul className="mt-2 space-y-1">
                  {optimizeResult.unassignedItems.map((u) => (
                    <li key={u.productId} className="text-sm text-slate-400">
                      <span className="text-white">{u.productName}</span> —{' '}
                      {u.reason}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Orders by supplier */}
            <div className="space-y-4">
              {optimizeResult.orders.map((order) => (
                <Card key={order.supplierId} className="overflow-hidden">
                  <div className="px-4 py-3 bg-slate-800/50 flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-semibold">
                        {order.supplierName}
                      </h3>
                      <span className="text-sm text-slate-400">
                        {order.items.length} prodotti
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-white">
                        &euro;{order.subtotal.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {order.warnings.length > 0 && (
                    <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
                      {order.warnings.map((w, i) => (
                        <p
                          key={i}
                          className="text-sm text-amber-400 flex items-center gap-1"
                        >
                          <AlertTriangle className="w-3 h-3" /> {w}
                        </p>
                      ))}
                    </div>
                  )}

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-800">
                        <th className="px-4 py-2 text-left">Prodotto</th>
                        <th className="px-4 py-2 text-right">Qtà</th>
                        <th className="px-4 py-2 text-right">Prezzo</th>
                        <th className="px-4 py-2 text-right">Totale</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {order.items.map((item) => (
                        <tr key={item.productId}>
                          <td className="px-4 py-2 text-white">
                            {item.productName}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-300">
                            {item.quantity} {item.productUnit ?? ''}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-300">
                            &euro;{item.unitPrice.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-right text-white font-medium">
                            &euro;{item.lineTotal.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ))}
            </div>

            {/* Notes + actions */}
            <div className="mt-6">
              <label className="block text-sm text-slate-400 mb-1">
                Note (opzionali)
              </label>
              <TextArea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Note per gli ordini..."
                rows={2}
              />
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Modifica lista
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowSaveTemplate(true)}
                >
                  <Save className="w-4 h-4 mr-1" /> Salva template
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Genera {optimizeResult.orders.length} ordini
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ---- STEP 4: Confirmation ---- */}
        {step === 4 && (
          <motion.div
            key="step4"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 text-green-400 mb-4">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Ordini creati!
            </h2>
            <p className="text-slate-400 mb-6">
              {createdOrderIds.length} ordini in bozza pronti per essere
              inviati
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => navigate('/orders')}>
                Vai agli Ordini
              </Button>
              <Button
                onClick={() => {
                  setStep(1);
                  setItems([]);
                  setOptimizeResult(null);
                  setCreatedOrderIds([]);
                  setNotes('');
                }}
              >
                Nuova Lista
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Template Modal */}
      <Modal
        isOpen={showSaveTemplate}
        onClose={() => setShowSaveTemplate(false)}
        title="Salva come Template"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Nome template
            </label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="es. Ordine settimanale cucina"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Frequenza
            </label>
            <select
              value={templateFrequency}
              onChange={(e) => setTemplateFrequency(e.target.value)}
              className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2"
            >
              <option value="weekly">Settimanale</option>
              <option value="biweekly">Bisettimanale</option>
              <option value="monthly">Mensile</option>
              <option value="custom">Personalizzata</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowSaveTemplate(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={!templateName || saveTemplateMutation.isPending}
            >
              Salva
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

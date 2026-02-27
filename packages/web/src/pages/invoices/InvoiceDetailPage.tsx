import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Plus,
  Trash2,
  Circle,
  Save,
  CheckCircle,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatCurrency } from '@/utils/format-currency';
import { cn } from '@/utils/cn';
import {
  Button,
  Card,
  Input,
  Select,
  DatePicker,
  Badge,
  Skeleton,
  useToast,
} from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface InvoiceLineData {
  id: string;
  description: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
  confidence: number;
}

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  vatAmount: number;
  netAmount: number;
  status: string;
  fileUrl: string;
  fileType: string; // 'pdf' | 'image'
  ocrConfidence: number;
  lines: InvoiceLineData[];
  fieldConfidence: Record<string, number>;
}

interface SupplierOption {
  id: string;
  name: string;
}

interface ProductOption {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

const lineSchema = z.object({
  id: z.string(),
  description: z.string().min(1, 'Obbligatorio'),
  productId: z.string(),
  quantity: z.number().min(0, 'Quantita non valida'),
  unitPrice: z.number().min(0, 'Prezzo non valido'),
  vatRate: z.number().min(0).max(100),
  lineTotal: z.number(),
  confidence: z.number(),
});

const invoiceFormSchema = z.object({
  supplierId: z.string().min(1, 'Seleziona un fornitore'),
  invoiceNumber: z.string().min(1, 'Numero fattura obbligatorio'),
  issueDate: z.date({ required_error: 'Data obbligatoria' }),
  dueDate: z.date({ required_error: 'Scadenza obbligatoria' }),
  totalAmount: z.number().min(0),
  vatAmount: z.number().min(0),
  lines: z.array(lineSchema),
});

type InvoiceFormData = z.infer<typeof invoiceFormSchema>;

/* ------------------------------------------------------------------ */
/*  Confidence dot                                                     */
/* ------------------------------------------------------------------ */

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.9
      ? 'text-green-500'
      : confidence >= 0.7
        ? 'text-amber-500'
        : 'text-red-500';
  return <Circle className={cn('h-2.5 w-2.5 fill-current', color)} />;
}

/* ------------------------------------------------------------------ */
/*  Document Viewer                                                    */
/* ------------------------------------------------------------------ */

function DocumentViewer({
  fileUrl,
  fileType,
}: {
  fileUrl: string;
  fileType: string;
}) {
  const [zoom, setZoom] = useState(1);

  const zoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const resetZoom = () => setZoom(1);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-slate-200 p-2 dark:border-slate-700">
        <Button variant="ghost" size="sm" onClick={zoomOut} icon={<ZoomOut className="h-4 w-4" />}>
          -
        </Button>
        <span className="text-xs text-slate-500 tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="sm" onClick={zoomIn} icon={<ZoomIn className="h-4 w-4" />}>
          +
        </Button>
        <Button variant="ghost" size="sm" onClick={resetZoom} icon={<RotateCcw className="h-4 w-4" />}>
          Reset
        </Button>
      </div>

      {/* Viewer */}
      <div className="flex-1 overflow-auto bg-slate-100 p-4 dark:bg-slate-900">
        {fileType === 'pdf' ? (
          <iframe
            src={fileUrl}
            className="h-full w-full rounded border-0"
            style={{ minHeight: '600px', transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            title="Anteprima fattura"
          />
        ) : (
          <div className="flex items-center justify-center" style={{ overflow: 'auto' }}>
            <img
              src={fileUrl}
              alt="Fattura"
              className="max-w-none rounded-lg shadow-lg"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  /* --- Fetch invoice data --- */
  const { data: invoice, isLoading, isError, refetch } = useQuery<InvoiceData>({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const res = await apiClient.get<InvoiceData>(`/invoices/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  /* --- Fetch suppliers for dropdown --- */
  const { data: suppliers } = useQuery<SupplierOption[]>({
    queryKey: ['suppliers', 'options'],
    queryFn: async () => {
      const res = await apiClient.get<SupplierOption[]>('/suppliers', { pageSize: 200 });
      return res.data;
    },
  });

  /* --- Fetch products for dropdown --- */
  const { data: products } = useQuery<ProductOption[]>({
    queryKey: ['products', 'options'],
    queryFn: async () => {
      const res = await apiClient.get<ProductOption[]>('/products', { pageSize: 500 });
      return res.data;
    },
  });

  /* --- Form --- */
  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceFormSchema),
    values: invoice
      ? {
          supplierId: invoice.supplierId,
          invoiceNumber: invoice.invoiceNumber,
          issueDate: new Date(invoice.issueDate),
          dueDate: new Date(invoice.dueDate),
          totalAmount: invoice.totalAmount,
          vatAmount: invoice.vatAmount,
          lines: invoice.lines,
        }
      : undefined,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  /* --- Supplier options --- */
  const supplierOptions = useMemo(
    () => (suppliers || []).map((s) => ({ value: s.id, label: s.name })),
    [suppliers],
  );

  /* --- Product options --- */
  const productOptions = useMemo(
    () => (products || []).map((p) => ({ value: p.id, label: p.name })),
    [products],
  );

  /* --- Auto-calc line totals --- */
  const watchedLines = form.watch('lines');
  const calculatedTotal = useMemo(
    () =>
      (watchedLines || []).reduce(
        (sum, line) => sum + (line.quantity || 0) * (line.unitPrice || 0),
        0,
      ),
    [watchedLines],
  );

  /* --- Save draft mutation --- */
  const saveDraftMutation = useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      await apiClient.put(`/invoices/${id}`, {
        ...data,
        issueDate: data.issueDate.toISOString(),
        dueDate: data.dueDate.toISOString(),
        status: 'to_verify',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      toast('Bozza salvata con successo', 'success');
    },
    onError: () => {
      toast('Errore nel salvataggio', 'error');
    },
  });

  /* --- Verify & confirm mutation --- */
  const verifyMutation = useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      await apiClient.put(`/invoices/${id}`, {
        ...data,
        issueDate: data.issueDate.toISOString(),
        dueDate: data.dueDate.toISOString(),
        status: 'verified',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      toast('Fattura verificata e confermata!', 'success');
      navigate('/invoices');
    },
    onError: () => {
      toast('Errore nella verifica', 'error');
    },
  });

  /* --- Add line --- */
  const addLine = () => {
    append({
      id: `new-${Date.now()}`,
      description: '',
      productId: '',
      quantity: 1,
      unitPrice: 0,
      vatRate: 22,
      lineTotal: 0,
      confidence: 1,
    });
  };

  /* --- Loading --- */
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton variant="rect" height={60} />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton variant="rect" height={600} />
          <Skeleton variant="rect" height={600} />
        </div>
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20">
        <p className="mb-4 text-sm text-red-700 dark:text-red-300">
          Errore nel caricamento della fattura.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Riprova
        </Button>
      </div>
    );
  }

  const ocrLabel =
    invoice.ocrConfidence >= 0.9
      ? 'Alta'
      : invoice.ocrConfidence >= 0.7
        ? 'Media'
        : 'Bassa';
  const ocrVariant =
    invoice.ocrConfidence >= 0.9
      ? 'success'
      : invoice.ocrConfidence >= 0.7
        ? 'warning'
        : 'error';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex min-h-screen flex-col"
    >
      {/* Header */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => navigate('/invoices')}
          className="mb-3 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna alle fatture
        </button>
        <div className="flex items-center gap-3">
          <FileText className="h-7 w-7 text-accent-green" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Revisione Fattura
          </h1>
          <Badge variant={ocrVariant as any}>
            OCR: {ocrLabel} ({Math.round(invoice.ocrConfidence * 100)}%)
          </Badge>
        </div>
      </div>

      {/* Split view */}
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: Document viewer */}
        <Card className="min-h-[600px] overflow-hidden p-0">
          <DocumentViewer
            fileUrl={invoice.fileUrl}
            fileType={invoice.fileType}
          />
        </Card>

        {/* Right: Extracted data form */}
        <div className="space-y-4">
          <Card header="Dati Estratti">
            <form
              onSubmit={form.handleSubmit((data) => verifyMutation.mutate(data))}
              className="space-y-4"
            >
              {/* Supplier */}
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <Controller
                    name="supplierId"
                    control={form.control}
                    render={({ field }) => (
                      <Select
                        label="Fornitore"
                        options={supplierOptions}
                        value={field.value}
                        onChange={(v) => field.onChange(v)}
                        searchable
                        error={form.formState.errors.supplierId?.message}
                      />
                    )}
                  />
                </div>
                {invoice.fieldConfidence?.supplierId !== undefined && (
                  <div className="mt-8">
                    <ConfidenceDot confidence={invoice.fieldConfidence.supplierId} />
                  </div>
                )}
              </div>

              {/* Invoice number */}
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    label="Numero Fattura"
                    {...form.register('invoiceNumber')}
                    error={form.formState.errors.invoiceNumber?.message}
                  />
                </div>
                {invoice.fieldConfidence?.invoiceNumber !== undefined && (
                  <div className="mt-8">
                    <ConfidenceDot confidence={invoice.fieldConfidence.invoiceNumber} />
                  </div>
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <Controller
                      name="issueDate"
                      control={form.control}
                      render={({ field }) => (
                        <DatePicker
                          label="Data Fattura"
                          value={field.value}
                          onChange={(d) => field.onChange(d)}
                          error={form.formState.errors.issueDate?.message}
                        />
                      )}
                    />
                  </div>
                  {invoice.fieldConfidence?.issueDate !== undefined && (
                    <div className="mt-8">
                      <ConfidenceDot confidence={invoice.fieldConfidence.issueDate} />
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <Controller
                      name="dueDate"
                      control={form.control}
                      render={({ field }) => (
                        <DatePicker
                          label="Data Scadenza"
                          value={field.value}
                          onChange={(d) => field.onChange(d)}
                          error={form.formState.errors.dueDate?.message}
                        />
                      )}
                    />
                  </div>
                  {invoice.fieldConfidence?.dueDate !== undefined && (
                    <div className="mt-8">
                      <ConfidenceDot confidence={invoice.fieldConfidence.dueDate} />
                    </div>
                  )}
                </div>
              </div>

              {/* Amounts */}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Importo Totale"
                  type="number"
                  step="0.01"
                  {...form.register('totalAmount', { valueAsNumber: true })}
                  error={form.formState.errors.totalAmount?.message}
                />
                <Input
                  label="IVA"
                  type="number"
                  step="0.01"
                  {...form.register('vatAmount', { valueAsNumber: true })}
                  error={form.formState.errors.vatAmount?.message}
                />
              </div>

              {/* Invoice lines */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Righe Fattura
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Plus className="h-4 w-4" />}
                    onClick={addLine}
                  >
                    Aggiungi Riga
                  </Button>
                </div>

                <div className="space-y-3">
                  {fields.map((field, index) => {
                    const qty = form.watch(`lines.${index}.quantity`) || 0;
                    const price = form.watch(`lines.${index}.unitPrice`) || 0;
                    const lineTotal = qty * price;

                    return (
                      <div
                        key={field.id}
                        className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-400">
                              #{index + 1}
                            </span>
                            {field.confidence < 1 && (
                              <ConfidenceDot confidence={field.confidence} />
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Input
                            label="Descrizione"
                            size="sm"
                            {...form.register(`lines.${index}.description`)}
                          />
                          <Controller
                            name={`lines.${index}.productId`}
                            control={form.control}
                            render={({ field: f }) => (
                              <Select
                                label="Prodotto"
                                options={productOptions}
                                value={f.value}
                                onChange={(v) => f.onChange(v)}
                                searchable
                              />
                            )}
                          />
                        </div>

                        <div className="mt-2 grid grid-cols-4 gap-2">
                          <Input
                            label="Qta"
                            type="number"
                            step="any"
                            size="sm"
                            {...form.register(`lines.${index}.quantity`, {
                              valueAsNumber: true,
                            })}
                          />
                          <Input
                            label="Prezzo Unit."
                            type="number"
                            step="0.01"
                            size="sm"
                            {...form.register(`lines.${index}.unitPrice`, {
                              valueAsNumber: true,
                            })}
                          />
                          <Input
                            label="IVA %"
                            type="number"
                            step="1"
                            size="sm"
                            {...form.register(`lines.${index}.vatRate`, {
                              valueAsNumber: true,
                            })}
                          />
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                              Totale
                            </label>
                            <p className="flex h-8 items-center rounded-lg bg-slate-50 px-2.5 text-sm font-semibold tabular-nums text-slate-900 dark:bg-slate-800 dark:text-white">
                              {formatCurrency(lineTotal)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Calculated total */}
                <div className="mt-3 flex items-center justify-end gap-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Totale calcolato:
                  </span>
                  <span className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatCurrency(calculatedTotal)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  icon={<Save className="h-4 w-4" />}
                  loading={saveDraftMutation.isPending}
                  onClick={form.handleSubmit((data) =>
                    saveDraftMutation.mutate(data),
                  )}
                >
                  Salva Bozza
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  icon={<CheckCircle className="h-4 w-4" />}
                  loading={verifyMutation.isPending}
                >
                  Verifica e Conferma
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}

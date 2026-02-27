import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Upload,
  Check,
  ChevronRight,
  Loader2,
  ArrowUp,
  ArrowDown,
  Minus as MinusIcon,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatCurrency } from '@/utils/format-currency';
import { cn } from '@/utils/cn';
import {
  Badge,
  Button,
  Card,
  FileUpload,
  Select,
  useToast,
} from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ImportParseResult {
  importId: string;
  columns: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
}

interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
}

interface PriceChange {
  productName: string;
  supplierName: string;
  oldPrice: number | null;
  newPrice: number;
  change: 'new' | 'increase' | 'decrease' | 'unchanged';
  percentChange: number | null;
}

interface ImportPreview {
  changes: PriceChange[];
  newProducts: number;
  updatedPrices: number;
  unchangedPrices: number;
}

interface ImportResult {
  imported: number;
  updated: number;
  errors: number;
  errorDetails: string[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TARGET_FIELDS = [
  { value: '', label: 'Non mappare' },
  { value: 'productName', label: 'Nome Prodotto' },
  { value: 'productCode', label: 'Codice Prodotto' },
  { value: 'category', label: 'Categoria' },
  { value: 'unit', label: 'Unita di Misura' },
  { value: 'price', label: 'Prezzo' },
  { value: 'description', label: 'Descrizione' },
];

const STEPS = [
  { num: 1, label: 'Carica File' },
  { num: 2, label: 'Mappatura Colonne' },
  { num: 3, label: 'Anteprima Modifiche' },
  { num: 4, label: 'Risultato' },
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

export default function ProductImportPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [parseResult, setParseResult] = useState<ImportParseResult | null>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  /* --- Suppliers for dropdown --- */
  const { data: suppliers = [] } = useQuery<{ id: string; businessName: string }[]>({
    queryKey: ['suppliers', 'list-simple'],
    queryFn: async () => {
      const res = await apiClient.get<{ id: string; businessName: string }[]>('/suppliers', {
        pageSize: 200,
      });
      return res.data;
    },
  });

  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: s.businessName })),
    [suppliers],
  );

  /* --- Step 1: Upload --- */
  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => {
      const formData = new FormData();
      files.forEach((f) => formData.append('file', f));
      return apiClient.upload<ImportParseResult>('/price-lists/import', formData);
    },
    onSuccess: (res) => {
      setParseResult(res.data);
      setColumnMappings(
        res.data.columns.map((col) => ({ sourceColumn: col, targetField: '' })),
      );
      setStep(2);
    },
    onError: () => toast('Errore nel caricamento del file', 'error'),
  });

  /* --- Step 2 -> 3: Preview --- */
  const previewMutation = useMutation({
    mutationFn: () =>
      apiClient.post<ImportPreview>('/price-lists/preview', {
        importId: parseResult?.importId,
        supplierId: selectedSupplier,
        mappings: columnMappings.filter((m) => m.targetField),
      }),
    onSuccess: (res) => {
      setPreview(res.data);
      setStep(3);
    },
    onError: () => toast("Errore nella generazione dell'anteprima", 'error'),
  });

  /* --- Step 3 -> 4: Confirm --- */
  const confirmMutation = useMutation({
    mutationFn: () =>
      apiClient.post<ImportResult>('/price-lists/confirm', {
        importId: parseResult?.importId,
        supplierId: selectedSupplier,
        mappings: columnMappings.filter((m) => m.targetField),
      }),
    onSuccess: (res) => {
      setImportResult(res.data);
      setStep(4);
      toast('Importazione completata', 'success');
    },
    onError: () => toast("Errore nell'importazione", 'error'),
  });

  const updateMapping = (index: number, targetField: string) => {
    setColumnMappings((prev) =>
      prev.map((m, i) => (i === index ? { ...m, targetField } : m)),
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto max-w-4xl space-y-6"
    >
      <Link
        to="/products"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-accent-green"
      >
        <ArrowLeft className="h-4 w-4" />
        Prodotti
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        Importa Listino Prezzi
      </h1>

      <StepIndicator current={step} />

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card>
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Carica un file CSV con il listino prezzi del fornitore. Il file verra analizzato
              e potrai mappare le colonne nella fase successiva.
            </p>
            {uploadMutation.isPending ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-accent-green" />
                <p className="mt-3 text-sm text-slate-500">Analisi del file in corso...</p>
              </div>
            ) : (
              <FileUpload
                accept=".csv,.xlsx,.xls"
                maxSize={10 * 1024 * 1024}
                onFiles={(files) => uploadMutation.mutate(files)}
              />
            )}
          </div>
        </Card>
      )}

      {/* Step 2: Column Mapping */}
      {step === 2 && parseResult && (
        <div className="space-y-6">
          <Card header="Seleziona Fornitore">
            <Select
              label="Fornitore *"
              options={supplierOptions}
              value={selectedSupplier}
              onChange={(v) => setSelectedSupplier(v as string)}
              placeholder="Seleziona il fornitore del listino"
            />
          </Card>

          <Card header="Mappatura Colonne">
            <p className="mb-4 text-sm text-slate-500">
              Associa ciascuna colonna del file al campo corrispondente.
              Trovate {parseResult.totalRows} righe nel file.
            </p>
            <div className="space-y-3">
              {columnMappings.map((mapping, index) => (
                <div
                  key={mapping.sourceColumn}
                  className="flex items-center gap-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                >
                  <span className="min-w-[160px] text-sm font-medium text-slate-700 dark:text-slate-300">
                    {mapping.sourceColumn}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  <Select
                    options={TARGET_FIELDS}
                    value={mapping.targetField}
                    onChange={(v) => updateMapping(index, v as string)}
                    placeholder="Non mappare"
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Sample Data Preview */}
          {parseResult.sampleRows.length > 0 && (
            <Card header="Anteprima Dati">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      {parseResult.columns.map((col) => (
                        <th
                          key={col}
                          className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.sampleRows.slice(0, 5).map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-slate-100 dark:border-slate-700/50"
                      >
                        {parseResult.columns.map((col) => (
                          <td
                            key={col}
                            className="px-3 py-2 text-slate-700 dark:text-slate-300"
                          >
                            {row[col] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Indietro
            </Button>
            <Button
              onClick={() => previewMutation.mutate()}
              loading={previewMutation.isPending}
              disabled={!selectedSupplier || !columnMappings.some((m) => m.targetField)}
            >
              Anteprima Modifiche
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Preview Changes */}
      {step === 3 && preview && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <p className="text-sm text-slate-500">Nuovi Prodotti</p>
              <p className="mt-1 text-2xl font-bold text-accent-green">{preview.newProducts}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Prezzi Aggiornati</p>
              <p className="mt-1 text-2xl font-bold text-blue-600">{preview.updatedPrices}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Invariati</p>
              <p className="mt-1 text-2xl font-bold text-slate-500">{preview.unchangedPrices}</p>
            </Card>
          </div>

          <Card header="Dettaglio Modifiche">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">
                      Prodotto
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">
                      Fornitore
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">
                      Prezzo Attuale
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">
                      Nuovo Prezzo
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium uppercase text-slate-500">
                      Variazione
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changes.map((change, i) => (
                    <tr
                      key={i}
                      className={cn(
                        'border-b border-slate-100 dark:border-slate-700/50',
                        change.change === 'increase' && 'bg-red-50/50 dark:bg-red-900/10',
                        change.change === 'decrease' && 'bg-green-50/50 dark:bg-green-900/10',
                        change.change === 'new' && 'bg-amber-50/50 dark:bg-amber-900/10',
                      )}
                    >
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                        {change.productName}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                        {change.supplierName}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {change.oldPrice !== null ? formatCurrency(change.oldPrice) : '-'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900 dark:text-white">
                        {formatCurrency(change.newPrice)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {change.change === 'new' && (
                          <Badge variant="warning">Nuovo</Badge>
                        )}
                        {change.change === 'increase' && (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-accent-red">
                            <ArrowUp className="h-3 w-3" />
                            +{change.percentChange?.toFixed(1)}%
                          </span>
                        )}
                        {change.change === 'decrease' && (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-accent-green">
                            <ArrowDown className="h-3 w-3" />
                            {change.percentChange?.toFixed(1)}%
                          </span>
                        )}
                        {change.change === 'unchanged' && (
                          <MinusIcon className="mx-auto h-4 w-4 text-slate-400" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Indietro
            </Button>
            <Button
              onClick={() => confirmMutation.mutate()}
              loading={confirmMutation.isPending}
            >
              Conferma Importazione
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {step === 4 && importResult && (
        <Card>
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent-green/10">
              <Check className="h-8 w-8 text-accent-green" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Importazione Completata
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Il listino prezzi e stato importato correttamente.
            </p>

            <div className="mx-auto mt-6 grid max-w-sm grid-cols-3 gap-4">
              <div>
                <p className="text-2xl font-bold text-accent-green">{importResult.imported}</p>
                <p className="text-xs text-slate-500">Importati</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
                <p className="text-xs text-slate-500">Aggiornati</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-accent-red">{importResult.errors}</p>
                <p className="text-xs text-slate-500">Errori</p>
              </div>
            </div>

            {importResult.errorDetails.length > 0 && (
              <div className="mx-auto mt-6 max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 text-left dark:border-red-800 dark:bg-red-900/20">
                <p className="mb-2 text-sm font-medium text-red-700 dark:text-red-300">
                  Dettaglio Errori:
                </p>
                <ul className="space-y-1 text-xs text-red-600 dark:text-red-400">
                  {importResult.errorDetails.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-8 flex justify-center gap-3">
              <Button variant="outline" onClick={() => navigate('/products')}>
                Torna ai Prodotti
              </Button>
              <Button
                onClick={() => {
                  setStep(1);
                  setParseResult(null);
                  setPreview(null);
                  setImportResult(null);
                  setSelectedSupplier('');
                }}
              >
                Nuova Importazione
              </Button>
            </div>
          </div>
        </Card>
      )}
    </motion.div>
  );
}

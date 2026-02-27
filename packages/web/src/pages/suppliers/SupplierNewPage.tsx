import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  Check,
  ChevronRight,
  Loader2,
  ArrowUp,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatCurrency } from '@/utils/format-currency';
import { cn } from '@/utils/cn';
import {
  Button,
  Card,
  FileUpload,
  Input,
  Select,
  Switch,
  TextArea,
  useToast,
} from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CATEGORIES = [
  { value: 'Ortofrutta', label: 'Ortofrutta' },
  { value: 'Ittico', label: 'Ittico' },
  { value: 'Carni', label: 'Carni' },
  { value: 'Latticini', label: 'Latticini' },
  { value: 'Beverage', label: 'Beverage' },
  { value: 'Secco', label: 'Secco' },
  { value: 'Non Food', label: 'Non Food' },
  { value: 'Altro', label: 'Altro' },
];

const WEEKDAYS = [
  { value: 0, label: 'Lun' },
  { value: 1, label: 'Mar' },
  { value: 2, label: 'Mer' },
  { value: 3, label: 'Gio' },
  { value: 4, label: 'Ven' },
  { value: 5, label: 'Sab' },
  { value: 6, label: 'Dom' },
];

const IMPORT_TARGET_FIELDS = [
  { value: '', label: 'Non mappare' },
  { value: 'product_name', label: 'Nome Prodotto' },
  { value: 'supplier_code', label: 'Codice Fornitore' },
  { value: 'price', label: 'Prezzo' },
  { value: 'unit', label: 'Unita di Misura' },
];

/* ------------------------------------------------------------------ */
/*  Zod schema                                                         */
/* ------------------------------------------------------------------ */

const contactSchema = z.object({
  name: z.string().min(1, 'Nome obbligatorio'),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email non valida').or(z.literal('')).optional(),
  isPrimary: z.boolean(),
});

const supplierSchema = z.object({
  businessName: z.string().min(1, 'Ragione sociale obbligatoria'),
  vatNumber: z.string().optional(),
  category: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  deliveryDays: z.array(z.number()),
  leadTimeDays: z.coerce.number().min(0).optional(),
  minimumOrderAmount: z.coerce.number().min(0).optional(),
  contacts: z.array(contactSchema),
});

type SupplierForm = z.infer<typeof supplierSchema>;

/* ------------------------------------------------------------------ */
/*  Import types                                                       */
/* ------------------------------------------------------------------ */

interface CatalogImportParse {
  headers: string[];
  columnMapping: Record<string, number>;
  preview: Record<string, string>[];
  totalRows: number;
  allData: Record<string, string>[];
}

interface CatalogImportResult {
  created: number;
  updated: number;
  skipped: number;
  alerts: { productName: string; oldPrice: number; newPrice: number; changePercent: number }[];
  errors: { row: number; message: string }[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SupplierNewPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // --- Supplier form state ---
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      businessName: '',
      vatNumber: '',
      category: '',
      paymentTerms: '',
      notes: '',
      deliveryDays: [],
      leadTimeDays: 0,
      minimumOrderAmount: 0,
      contacts: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'contacts',
  });

  // --- Post-creation state ---
  const [createdSupplier, setCreatedSupplier] = useState<{ id: string; name: string } | null>(null);

  // --- Import wizard state ---
  const [importStep, setImportStep] = useState(1);
  const [parseResult, setParseResult] = useState<CatalogImportParse | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, number>>({});
  const [importResult, setImportResult] = useState<CatalogImportResult | null>(null);

  // --- Mutations ---
  const createMutation = useMutation({
    mutationFn: (data: SupplierForm) =>
      apiClient.post<{ id: string }>('/suppliers', data),
    onSuccess: (res, variables) => {
      toast('Fornitore creato con successo', 'success');
      setCreatedSupplier({ id: res.data.id, name: variables.businessName });
    },
    onError: () => toast('Errore nella creazione del fornitore', 'error'),
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => {
      const formData = new FormData();
      files.forEach((f) => formData.append('file', f));
      return apiClient.upload<CatalogImportParse>('/price-lists/import', formData);
    },
    onSuccess: (res) => {
      setParseResult(res.data);
      setColumnMapping(res.data.columnMapping || {});
      setImportStep(2);
    },
    onError: () => toast('Errore nel caricamento del file', 'error'),
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      apiClient.post<CatalogImportResult>('/price-lists/confirm', {
        supplierId: createdSupplier!.id,
        columnMapping,
        data: parseResult?.allData ?? [],
      }),
    onSuccess: (res) => {
      setImportResult(res.data);
      setImportStep(3);
      toast('Catalogo importato con successo', 'success');
    },
    onError: () => toast("Errore nell'importazione del catalogo", 'error'),
  });

  const onSubmit = (data: SupplierForm) => {
    createMutation.mutate(data);
  };

  const updateMappingField = (field: string, colIndex: number | '') => {
    setColumnMapping((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k === field) delete next[k];
      });
      if (colIndex !== '') {
        next[field] = colIndex as number;
      }
      return next;
    });
  };

  /* ================================================================ */
  /*  POST-CREATION: Catalog Import Wizard                             */
  /* ================================================================ */
  if (createdSupplier) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mx-auto max-w-3xl space-y-6"
      >
        <Link
          to="/suppliers"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-accent-green"
        >
          <ArrowLeft className="h-4 w-4" />
          Fornitori
        </Link>

        {/* Success banner */}
        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-green/10">
              <Check className="h-5 w-5 text-accent-green" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">
                Fornitore &quot;{createdSupplier.name}&quot; creato
              </p>
              <p className="text-sm text-slate-500">
                Ora puoi importare il catalogo prodotti oppure completare dopo.
              </p>
            </div>
          </div>
        </Card>

        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Importa Catalogo Fornitore
        </h2>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {[
            { num: 1, label: 'Carica File' },
            { num: 2, label: 'Mappatura Colonne' },
            { num: 3, label: 'Risultato' },
          ].map((step, i) => (
            <div key={step.num} className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
                  importStep > step.num
                    ? 'bg-accent-green text-white'
                    : importStep === step.num
                      ? 'bg-accent-green/10 text-accent-green ring-2 ring-accent-green'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-700',
                )}
              >
                {importStep > step.num ? <Check className="h-4 w-4" /> : step.num}
              </div>
              <span
                className={cn(
                  'hidden text-sm sm:inline',
                  importStep >= step.num
                    ? 'font-medium text-slate-900 dark:text-white'
                    : 'text-slate-400',
                )}
              >
                {step.label}
              </span>
              {i < 2 && <ChevronRight className="h-4 w-4 text-slate-300" />}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {importStep === 1 && (
          <Card>
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Carica un file CSV o Excel con il catalogo del fornitore.
                Il file verra analizzato e potrai mappare le colonne nella fase successiva.
              </p>
              <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                <p className="mb-2 text-xs font-medium text-slate-500">Formato atteso:</p>
                <div className="overflow-x-auto">
                  <table className="text-xs text-slate-600 dark:text-slate-400">
                    <thead>
                      <tr>
                        <th className="px-3 py-1 text-left font-medium">Nome Prodotto</th>
                        <th className="px-3 py-1 text-left font-medium">Codice</th>
                        <th className="px-3 py-1 text-left font-medium">Prezzo</th>
                        <th className="px-3 py-1 text-left font-medium">U.M.</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-3 py-1">Pomodoro San Marzano</td>
                        <td className="px-3 py-1">PM001</td>
                        <td className="px-3 py-1">2,50</td>
                        <td className="px-3 py-1">kg</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-1">Mozzarella di Bufala</td>
                        <td className="px-3 py-1">MB002</td>
                        <td className="px-3 py-1">8,90</td>
                        <td className="px-3 py-1">kg</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
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
        {importStep === 2 && parseResult && (
          <div className="space-y-6">
            <Card header="Mappatura Colonne">
              <p className="mb-4 text-sm text-slate-500">
                Associa ciascun campo alla colonna corrispondente del file.
                Trovate <strong>{parseResult.totalRows}</strong> righe.
              </p>
              <div className="space-y-3">
                {IMPORT_TARGET_FIELDS.filter((f) => f.value).map((field) => {
                  const currentCol = columnMapping[field.value];
                  const colOptions = [
                    { value: '', label: 'Non mappare' },
                    ...parseResult.headers.map((h, i) => ({
                      value: String(i),
                      label: h,
                    })),
                  ];
                  return (
                    <div
                      key={field.value}
                      className="flex items-center gap-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                    >
                      <span className="min-w-[160px] text-sm font-medium text-slate-700 dark:text-slate-300">
                        {field.label}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      <Select
                        options={colOptions}
                        value={currentCol !== undefined ? String(currentCol) : ''}
                        onChange={(v) =>
                          updateMappingField(field.value, v ? parseInt(v as string, 10) : '')
                        }
                        placeholder="Seleziona colonna"
                        className="flex-1"
                      />
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Sample data preview */}
            {parseResult.preview.length > 0 && (
              <Card header="Anteprima Dati (prime 5 righe)">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        {parseResult.headers.map((col) => (
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
                      {parseResult.preview.slice(0, 5).map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-slate-100 dark:border-slate-700/50"
                        >
                          {parseResult.headers.map((col) => (
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
              <Button variant="ghost" onClick={() => setImportStep(1)}>
                Indietro
              </Button>
              <Button
                onClick={() => confirmMutation.mutate()}
                loading={confirmMutation.isPending}
                disabled={!columnMapping.product_name && !columnMapping.supplier_code}
              >
                Conferma Importazione
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {importStep === 3 && importResult && (
          <Card>
            <div className="py-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent-green/10">
                <Check className="h-8 w-8 text-accent-green" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Importazione Completata
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Il catalogo di {createdSupplier.name} e stato importato.
              </p>

              <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-4">
                <div>
                  <p className="text-2xl font-bold text-accent-green">{importResult.created}</p>
                  <p className="text-xs text-slate-500">Nuovi prodotti</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
                  <p className="text-xs text-slate-500">Prezzi aggiornati</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-400">{importResult.skipped}</p>
                  <p className="text-xs text-slate-500">Righe saltate</p>
                </div>
              </div>

              {importResult.alerts.length > 0 && (
                <div className="mx-auto mt-6 max-w-lg rounded-lg border border-amber-200 bg-amber-50 p-4 text-left dark:border-amber-800 dark:bg-amber-900/20">
                  <p className="mb-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                    Avvisi Prezzo ({importResult.alerts.length}):
                  </p>
                  <ul className="space-y-1 text-xs text-amber-600 dark:text-amber-400">
                    {importResult.alerts.map((alert, i) => (
                      <li key={i} className="flex items-center gap-1">
                        <ArrowUp className="h-3 w-3" />
                        {alert.productName}: {formatCurrency(alert.oldPrice)} → {formatCurrency(alert.newPrice)}
                        <span className="font-medium">(+{alert.changePercent}%)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {importResult.errors.length > 0 && (
                <div className="mx-auto mt-4 max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 text-left dark:border-red-800 dark:bg-red-900/20">
                  <p className="mb-2 text-sm font-medium text-red-700 dark:text-red-300">
                    Errori ({importResult.errors.length}):
                  </p>
                  <ul className="space-y-1 text-xs text-red-600 dark:text-red-400">
                    {importResult.errors.map((err, i) => (
                      <li key={i}>Riga {err.row}: {err.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-8 flex justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => navigate(`/suppliers/${createdSupplier.id}`)}
                >
                  Vai al Fornitore
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Skip / Go to supplier button (visible on steps 1 & 2) */}
        {importStep < 3 && (
          <div className="flex justify-center border-t border-slate-200 pt-4 dark:border-slate-700">
            <Button
              variant="ghost"
              onClick={() => navigate(`/suppliers/${createdSupplier.id}`)}
            >
              Salta e vai al fornitore
            </Button>
          </div>
        )}
      </motion.div>
    );
  }

  /* ================================================================ */
  /*  SUPPLIER CREATION FORM                                           */
  /* ================================================================ */
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto max-w-3xl space-y-6"
    >
      {/* Back link */}
      <Link
        to="/suppliers"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-accent-green"
      >
        <ArrowLeft className="h-4 w-4" />
        Fornitori
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        Nuovo Fornitore
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* -- Dati Aziendali -- */}
        <Card header="Dati Aziendali">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Ragione Sociale *"
              error={errors.businessName?.message}
              {...register('businessName')}
            />
            <Input label="Partita IVA" {...register('vatNumber')} />
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Select
                  label="Categoria"
                  options={CATEGORIES}
                  value={field.value || ''}
                  onChange={(v) => field.onChange(v as string)}
                  placeholder="Seleziona categoria"
                />
              )}
            />
            <Input
              label="Termini di Pagamento"
              placeholder="es. 30 gg DFFM"
              {...register('paymentTerms')}
            />
          </div>
          <div className="mt-4">
            <TextArea
              label="Note"
              rows={3}
              placeholder="Note interne sul fornitore..."
              {...register('notes')}
            />
          </div>
        </Card>

        {/* -- Consegne -- */}
        <Card header="Consegne">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Giorni di Consegna
              </label>
              <Controller
                control={control}
                name="deliveryDays"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((day) => {
                      const selected = field.value.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() =>
                            field.onChange(
                              selected
                                ? field.value.filter((v: number) => v !== day.value)
                                : [...field.value, day.value],
                            )
                          }
                          className={cn(
                            'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                            selected
                              ? 'bg-accent-green text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300',
                          )}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Lead Time (giorni)"
                type="number"
                min={0}
                {...register('leadTimeDays')}
              />
              <Input
                label="Ordine Minimo (EUR)"
                type="number"
                min={0}
                step={0.01}
                {...register('minimumOrderAmount')}
              />
            </div>
          </div>
        </Card>

        {/* -- Contatti -- */}
        <Card header="Contatti">
          <div className="space-y-4">
            {fields.length === 0 && (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                Nessun contatto aggiunto. Clicca il pulsante per aggiungerne uno.
              </p>
            )}

            {fields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Contatto {index + 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 className="h-4 w-4" />}
                    className="text-accent-red hover:text-red-700"
                    onClick={() => remove(index)}
                  >
                    Rimuovi
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Nome *"
                    error={errors.contacts?.[index]?.name?.message}
                    {...register(`contacts.${index}.name`)}
                  />
                  <Input
                    label="Ruolo"
                    placeholder="es. Responsabile Vendite"
                    {...register(`contacts.${index}.role`)}
                  />
                  <Input
                    label="Telefono"
                    {...register(`contacts.${index}.phone`)}
                  />
                  <Input
                    label="Email"
                    type="email"
                    error={errors.contacts?.[index]?.email?.message}
                    {...register(`contacts.${index}.email`)}
                  />
                </div>
                <div className="mt-3">
                  <Controller
                    control={control}
                    name={`contacts.${index}.isPrimary`}
                    render={({ field: switchField }) => (
                      <Switch
                        label="Contatto principale"
                        checked={switchField.value}
                        onChange={switchField.onChange}
                      />
                    )}
                  />
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              icon={<Plus className="h-4 w-4" />}
              onClick={() =>
                append({ name: '', role: '', phone: '', email: '', isPrimary: false })
              }
            >
              Aggiungi Contatto
            </Button>
          </div>
        </Card>

        {/* -- Footer -- */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6 dark:border-slate-700">
          <Button variant="ghost" onClick={() => navigate('/suppliers')}>
            Annulla
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Crea Fornitore
          </Button>
        </div>
      </form>
    </motion.div>
  );
}

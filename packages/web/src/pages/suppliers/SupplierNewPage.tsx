import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { cn } from '@/utils/cn';
import {
  Button,
  Card,
  Checkbox,
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
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SupplierNewPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

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

  const mutation = useMutation({
    mutationFn: (data: SupplierForm) =>
      apiClient.post<{ id: string }>('/suppliers', data),
    onSuccess: (res) => {
      toast('Fornitore creato con successo', 'success');
      navigate(`/suppliers/${res.data.id}`);
    },
    onError: () => toast('Errore nella creazione del fornitore', 'error'),
  });

  const onSubmit = (data: SupplierForm) => {
    mutation.mutate(data);
  };

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
          <Button type="submit" loading={mutation.isPending}>
            Crea Fornitore
          </Button>
        </div>
      </form>
    </motion.div>
  );
}

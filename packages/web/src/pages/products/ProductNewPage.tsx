import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import {
  Button,
  Card,
  Checkbox,
  Input,
  Select,
  Switch,
  useToast,
} from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

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
  'Glutine',
  'Crostacei',
  'Uova',
  'Pesce',
  'Arachidi',
  'Soia',
  'Latte',
  'Frutta a guscio',
  'Sedano',
  'Senape',
  'Sesamo',
  'Anidride solforosa',
  'Lupini',
  'Molluschi',
];

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

const productSchema = z.object({
  name: z.string().min(1, 'Nome obbligatorio'),
  category: z.string().optional(),
  unit: z.string().optional(),
  weightFormat: z.string().optional(),
  internalCode: z.string().optional(),
  allergens: z.array(z.string()),
  bio: z.boolean(),
  dop: z.boolean(),
  igp: z.boolean(),
});

type ProductForm = z.infer<typeof productSchema>;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProductNewPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      category: '',
      unit: '',
      weightFormat: '',
      internalCode: '',
      allergens: [],
      bio: false,
      dop: false,
      igp: false,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: ProductForm) =>
      apiClient.post<{ id: string }>('/products', data),
    onSuccess: (res) => {
      toast('Prodotto creato con successo', 'success');
      navigate(`/products/${res.data.id}`);
    },
    onError: () => toast('Errore nella creazione del prodotto', 'error'),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto max-w-3xl space-y-6"
    >
      <Link
        to="/products"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-accent-green"
      >
        <ArrowLeft className="h-4 w-4" />
        Prodotti
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        Nuovo Prodotto
      </h1>

      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
        <Card header="Informazioni Prodotto">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nome Prodotto *"
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
                  placeholder="Seleziona categoria"
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
                  placeholder="Seleziona unita"
                />
              )}
            />
            <Input
              label="Formato Peso"
              placeholder="es. 1kg, 500g, 6x1lt"
              {...register('weightFormat')}
            />
            <Input
              label="Codice Interno"
              placeholder="es. PRD-001"
              {...register('internalCode')}
            />
          </div>
        </Card>

        <Card header="Certificazioni">
          <div className="flex flex-wrap gap-6">
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
        </Card>

        <Card header="Allergeni">
          <Controller
            control={control}
            name="allergens"
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {ALLERGENS.map((allergen) => (
                  <Checkbox
                    key={allergen}
                    label={allergen}
                    checked={field.value.includes(allergen)}
                    onChange={(checked) => {
                      if (checked) {
                        field.onChange([...field.value, allergen]);
                      } else {
                        field.onChange(field.value.filter((a) => a !== allergen));
                      }
                    }}
                  />
                ))}
              </div>
            )}
          />
        </Card>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6 dark:border-slate-700">
          <Button variant="ghost" onClick={() => navigate('/products')}>
            Annulla
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Crea Prodotto
          </Button>
        </div>
      </form>
    </motion.div>
  );
}

import { useState, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Building2,
  MoreVertical,
  Pencil,
  Trash2,
  Phone,
  Mail,
  Plus,
  Download,
  FileText,
  Clock,
  User,
  Upload,
  Check,
  ChevronRight,
  Loader2,
  ArrowUp,
  ArrowDown,
  Minus as MinusIcon,
  Package,
  Search,
} from 'lucide-react';

const SupplierScorecard = lazy(() => import('./SupplierScorecard'));
import { apiClient } from '@/services/api-client';
import { formatDate, formatDateTime } from '@/utils/format-date';
import { formatCurrency } from '@/utils/format-currency';
import { cn } from '@/utils/cn';
import {
  Badge,
  Button,
  Card,
  DataTable,
  DatePicker,
  DropdownMenu,
  EmptyState,
  FileUpload,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  Tabs,
  TextArea,
  useToast,
  type ColumnDef,
  type TabItem,
} from '@/components/ui';
import { useMemo } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SupplierDetail {
  id: string;
  businessName: string;
  vatNumber: string;
  category: string;
  paymentTerms: string;
  deliveryDays: number[];
  leadTimeDays: number;
  minimumOrderAmount: number;
  notes: string;
  score: number | null;
  activeProducts: number;
  contacts: Contact[];
  createdAt: string;
  updatedAt: string;
}

interface Contact {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

interface SupplierDocument {
  id: string;
  fileName: string;
  type: string;
  fileUrl: string;
  uploadDate: string;
  expiryDate: string | null;
}

interface SupplierOrder {
  id: string;
  orderNumber: string;
  date: string;
  status: string;
  totalAmount: number;
}

interface AuditLog {
  id: string;
  action: string;
  description: string;
  userName: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const WEEKDAYS = [
  { value: 1, short: 'Lun', label: 'Lunedi' },
  { value: 2, short: 'Mar', label: 'Martedi' },
  { value: 3, short: 'Mer', label: 'Mercoledi' },
  { value: 4, short: 'Gio', label: 'Giovedi' },
  { value: 5, short: 'Ven', label: 'Venerdi' },
  { value: 6, short: 'Sab', label: 'Sabato' },
  { value: 0, short: 'Dom', label: 'Domenica' },
];

const CATEGORIES = [
  'Ortofrutta', 'Ittico', 'Carni', 'Latticini',
  'Beverage', 'Secco', 'Non Food', 'Altro',
];

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: c }));

const DOC_TYPES = [
  { value: 'certificazione', label: 'Certificazione' },
  { value: 'contratto', label: 'Contratto' },
  { value: 'listino', label: 'Listino Prezzi' },
  { value: 'altro', label: 'Altro' },
];

const TAB_ITEMS: TabItem[] = [
  { value: 'info', label: 'Informazioni' },
  { value: 'contacts', label: 'Contatti' },
  { value: 'catalog', label: 'Catalogo' },
  { value: 'documents', label: 'Documenti' },
  { value: 'orders', label: 'Ordini' },
  { value: 'performance', label: 'Performance' },
  { value: 'history', label: 'Storico' },
];

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                        */
/* ------------------------------------------------------------------ */

const editSupplierSchema = z.object({
  businessName: z.string().min(1, 'Ragione sociale obbligatoria'),
  vatNumber: z.string().optional(),
  category: z.string().min(1, 'Categoria obbligatoria'),
  paymentTerms: z.string().optional(),
  deliveryDays: z.array(z.number()),
  leadTimeDays: z.coerce.number().min(0).optional(),
  minimumOrderAmount: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});

type EditSupplierForm = z.infer<typeof editSupplierSchema>;

const contactSchema = z.object({
  name: z.string().min(1, 'Nome obbligatorio'),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email non valida').or(z.literal('')).optional(),
  isPrimary: z.boolean(),
});

type ContactForm = z.infer<typeof contactSchema>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function scoreBadge(score: number | null, large = false) {
  const cls = large ? 'text-sm px-3 py-1' : '';
  if (score === null || score === undefined) {
    return <Badge variant="neutral" className={cls}>N/D</Badge>;
  }
  if (score > 80) return <Badge variant="success" className={cls}>{score}</Badge>;
  if (score >= 50) return <Badge variant="warning" className={cls}>{score}</Badge>;
  return <Badge variant="error" className={cls}>{score}</Badge>;
}

function docExpiryBadge(expiryDate: string | null) {
  if (!expiryDate) return <Badge variant="neutral">Nessuna Scadenza</Badge>;
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return <Badge variant="error">Scaduto</Badge>;
  if (diffDays <= 30) return <Badge variant="warning">In Scadenza</Badge>;
  return <Badge variant="success">Valido</Badge>;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/* -- Info Tab -- */
function InfoTab({
  supplier,
  onUpdate,
}: {
  supplier: SupplierDetail;
  onUpdate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditSupplierForm>({
    resolver: zodResolver(editSupplierSchema),
    defaultValues: {
      businessName: supplier.businessName,
      vatNumber: supplier.vatNumber || '',
      category: supplier.category,
      paymentTerms: supplier.paymentTerms || '',
      deliveryDays: supplier.deliveryDays || [],
      leadTimeDays: supplier.leadTimeDays || 0,
      minimumOrderAmount: supplier.minimumOrderAmount || 0,
      notes: supplier.notes || '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data: EditSupplierForm) =>
      apiClient.put(`/suppliers/${supplier.id}`, data),
    onSuccess: () => {
      toast('Fornitore aggiornato', 'success');
      queryClient.invalidateQueries({ queryKey: ['supplier', supplier.id] });
      setEditing(false);
      onUpdate();
    },
    onError: () => toast('Errore durante il salvataggio', 'error'),
  });

  const handleCancel = () => {
    reset();
    setEditing(false);
  };

  if (editing) {
    return (
      <Card>
        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Ragione Sociale *"
              error={errors.businessName?.message}
              {...register('businessName')}
            />
            <Input label="P.IVA" {...register('vatNumber')} />
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Select
                  label="Categoria"
                  options={CATEGORY_OPTIONS}
                  value={field.value}
                  onChange={(v) => field.onChange(v as string)}
                  error={errors.category?.message}
                />
              )}
            />
            <Input label="Termini Pagamento" {...register('paymentTerms')} />
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

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Giorni Consegna
            </label>
            <Controller
              control={control}
              name="deliveryDays"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const selected = field.value.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() =>
                          field.onChange(
                            selected
                              ? field.value.filter((v: number) => v !== d.value)
                              : [...field.value, d.value],
                          )
                        }
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                          selected
                            ? 'bg-accent-green text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300',
                        )}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </div>

          <TextArea label="Note" rows={3} {...register('notes')} />

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isSubmitting}>
              Salva Modifiche
            </Button>
            <Button variant="ghost" onClick={handleCancel}>
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
        <InfoField label="Ragione Sociale" value={supplier.businessName} />
        <InfoField label="P.IVA" value={supplier.vatNumber || '-'} />
        <InfoField label="Termini Pagamento" value={supplier.paymentTerms || '-'} />
        <InfoField
          label="Lead Time"
          value={supplier.leadTimeDays ? `${supplier.leadTimeDays} giorni` : '-'}
        />
        <InfoField
          label="Ordine Minimo"
          value={supplier.minimumOrderAmount ? formatCurrency(supplier.minimumOrderAmount) : '-'}
        />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Giorni Consegna
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {supplier.deliveryDays && supplier.deliveryDays.length > 0
              ? WEEKDAYS.filter((d) => supplier.deliveryDays.includes(d.value)).map((d) => (
                  <Badge key={d.value} variant="info" size="sm">
                    {d.short}
                  </Badge>
                ))
              : <span className="text-sm text-slate-500">-</span>}
          </div>
        </div>
        <div className="sm:col-span-2">
          <InfoField label="Note" value={supplier.notes || '-'} />
        </div>
      </div>
      <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
        <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
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

/* -- Contacts Tab -- */
function ContactsTab({ supplierId }: { supplierId: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ['supplier', supplierId, 'contacts'],
    queryFn: async () => {
      const res = await apiClient.get<Contact[]>(`/suppliers/${supplierId}/contacts`);
      return res.data;
    },
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', role: '', phone: '', email: '', isPrimary: false },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['supplier', supplierId, 'contacts'] });

  const createMutation = useMutation({
    mutationFn: (data: ContactForm) =>
      apiClient.post(`/suppliers/${supplierId}/contacts`, data),
    onSuccess: () => {
      toast('Contatto aggiunto', 'success');
      invalidate();
      closeModal();
    },
    onError: () => toast('Errore nella creazione del contatto', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: ContactForm & { id: string }) =>
      apiClient.put(`/suppliers/${supplierId}/contacts/${data.id}`, data),
    onSuccess: () => {
      toast('Contatto aggiornato', 'success');
      invalidate();
      closeModal();
    },
    onError: () => toast("Errore nell'aggiornamento del contatto", 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (contactId: string) =>
      apiClient.del(`/suppliers/${supplierId}/contacts/${contactId}`),
    onSuccess: () => {
      toast('Contatto eliminato', 'success');
      invalidate();
    },
    onError: () => toast("Errore nell'eliminazione del contatto", 'error'),
  });

  const openCreate = () => {
    setEditingContact(null);
    reset({ name: '', role: '', phone: '', email: '', isPrimary: false });
    setModalOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditingContact(c);
    reset({ name: c.name, role: c.role, phone: c.phone, email: c.email, isPrimary: c.isPrimary });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingContact(null);
    reset();
  };

  const onSubmit = (data: ContactForm) => {
    if (editingContact) {
      updateMutation.mutate({ ...data, id: editingContact.id });
    } else {
      createMutation.mutate(data);
    }
  };

  if (isLoading) {
    return <div className="space-y-3"><Skeleton variant="rect" height={80} count={3} /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
          Aggiungi Contatto
        </Button>
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          icon={User}
          title="Nessun contatto"
          description="Aggiungi almeno un contatto per questo fornitore."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {contacts.map((c) => (
            <Card key={c.id} className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{c.name}</p>
                  {c.role && (
                    <p className="text-sm text-slate-400">{c.role}</p>
                  )}
                </div>
                {c.isPrimary && <Badge variant="info">Principale</Badge>}
              </div>
              <div className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                {c.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    <span>{c.phone}</span>
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-slate-400" />
                    <span>{c.email}</span>
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                  Modifica
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-accent-red hover:text-red-700"
                  onClick={() => deleteMutation.mutate(c.id)}
                >
                  Elimina
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Contact modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingContact ? 'Modifica Contatto' : 'Nuovo Contatto'}
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>
              Annulla
            </Button>
            <Button loading={isSubmitting} onClick={handleSubmit(onSubmit)}>
              {editingContact ? 'Aggiorna' : 'Aggiungi'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Nome *" error={errors.name?.message} {...register('name')} />
          <Input label="Ruolo" {...register('role')} />
          <Input label="Telefono" {...register('phone')} />
          <Input label="Email" error={errors.email?.message} {...register('email')} />
          <Controller
            control={control}
            name="isPrimary"
            render={({ field }) => (
              <Switch
                label="Contatto principale"
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </form>
      </Modal>
    </div>
  );
}

/* -- Documents Tab -- */
function DocumentsTab({ supplierId }: { supplierId: string }) {
  const [uploadType, setUploadType] = useState('certificazione');
  const [uploadExpiry, setUploadExpiry] = useState<Date | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery<SupplierDocument[]>({
    queryKey: ['supplier', supplierId, 'documents'],
    queryFn: async () => {
      const res = await apiClient.get<SupplierDocument[]>(`/suppliers/${supplierId}/documents`);
      return res.data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => {
      const formData = new FormData();
      files.forEach((f) => formData.append('file', f));
      formData.append('type', uploadType);
      if (uploadExpiry) formData.append('expiryDate', uploadExpiry.toISOString());
      return apiClient.upload(`/suppliers/${supplierId}/documents`, formData);
    },
    onSuccess: () => {
      toast('Documento caricato', 'success');
      queryClient.invalidateQueries({ queryKey: ['supplier', supplierId, 'documents'] });
      setUploadExpiry(null);
    },
    onError: () => toast('Errore nel caricamento', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) =>
      apiClient.del(`/suppliers/${supplierId}/documents/${docId}`),
    onSuccess: () => {
      toast('Documento eliminato', 'success');
      queryClient.invalidateQueries({ queryKey: ['supplier', supplierId, 'documents'] });
    },
    onError: () => toast("Errore nell'eliminazione", 'error'),
  });

  if (isLoading) {
    return <Skeleton variant="rect" height={80} count={3} />;
  }

  return (
    <div className="space-y-6">
      {/* Upload section */}
      <Card header="Carica Documento">
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Select
            label="Tipo Documento"
            options={DOC_TYPES}
            value={uploadType}
            onChange={(v) => setUploadType(v as string)}
          />
          <DatePicker
            label="Data Scadenza (opzionale)"
            value={uploadExpiry}
            onChange={setUploadExpiry}
            placeholder="Nessuna scadenza"
          />
        </div>
        <FileUpload
          accept=".pdf,.doc,.docx,.xlsx,.jpg,.png"
          multiple
          maxSize={10 * 1024 * 1024}
          onFiles={(files) => uploadMutation.mutate(files)}
        />
      </Card>

      {/* Document list */}
      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nessun documento"
          description="Carica documenti come certificazioni, contratti o listini."
        />
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {doc.fileName}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                      <Badge variant="neutral" size="sm">{doc.type}</Badge>
                      <span>Caricato il {formatDate(doc.uploadDate)}</span>
                      {doc.expiryDate && (
                        <span>- Scadenza {formatDate(doc.expiryDate)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {docExpiryBadge(doc.expiryDate)}
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(doc.id)}
                    className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-accent-red dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* -- Orders Tab -- */
function OrdersTab({ supplierId }: { supplierId: string }) {
  const navigate = useNavigate();

  const { data: orders = [], isLoading } = useQuery<SupplierOrder[]>({
    queryKey: ['supplier', supplierId, 'orders'],
    queryFn: async () => {
      // orders for this supplier are included in supplier detail or via a query param
      const res = await apiClient.get<SupplierOrder[]>('/orders', {
        supplierId,
        pageSize: 50,
      });
      return res.data;
    },
  });

  const STATUS_VARIANT: Record<string, 'draft' | 'pending_approval' | 'approved' | 'sent' | 'received' | 'cancelled' | 'neutral'> = {
    draft: 'draft',
    pending_approval: 'pending_approval',
    approved: 'approved',
    sent: 'sent',
    partially_received: 'warning' as 'neutral',
    received: 'received',
    cancelled: 'cancelled',
  };

  const STATUS_LABEL: Record<string, string> = {
    draft: 'Bozza',
    pending_approval: 'In Approvazione',
    approved: 'Approvato',
    sent: 'Inviato',
    partially_received: 'Ricevuto Parz.',
    received: 'Ricevuto',
    cancelled: 'Annullato',
  };

  const columns: ColumnDef<SupplierOrder>[] = [
    {
      key: 'orderNumber',
      header: 'N. Ordine',
      cell: (row) => (
        <span className="font-medium text-slate-900 dark:text-white">
          {row.orderNumber}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Data',
      cell: (row) => formatDate(row.date),
    },
    {
      key: 'status',
      header: 'Stato',
      cell: (row) => (
        <Badge variant={STATUS_VARIANT[row.status] || 'neutral'}>
          {STATUS_LABEL[row.status] || row.status}
        </Badge>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Totale',
      cell: (row) => (
        <span className="tabular-nums font-medium">
          {formatCurrency(row.totalAmount)}
        </span>
      ),
    },
  ];

  if (isLoading) {
    return <DataTable columns={columns} data={[]} loading />;
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Nessun ordine per questo fornitore"
        description="Gli ordini appariranno qui una volta creati."
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={orders}
      onRowClick={(row) => navigate(`/orders/${row.id}`)}
    />
  );
}

/* -- History Tab -- */
function HistoryTab({ supplierId }: { supplierId: string }) {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ data: AuditLog[]; hasMore: boolean }>({
    queryKey: ['supplier', supplierId, 'history', page],
    queryFn: async () => {
      const res = await apiClient.get<AuditLog[]>(`/suppliers/${supplierId}/history`, {
        page,
        pageSize: 20,
      });
      const hasMore = (res.pagination?.page ?? 1) < (res.pagination?.totalPages ?? 1);
      return { data: res.data, hasMore };
    },
  });

  const [allEntries, setAllEntries] = useState<AuditLog[]>([]);

  // Append new page data
  const entries = data?.data ?? [];
  if (entries.length > 0 && !allEntries.find((e) => e.id === entries[0]?.id)) {
    setAllEntries((prev) => [...prev, ...entries]);
  }

  const displayEntries = allEntries.length > 0 ? allEntries : entries;

  if (isLoading && displayEntries.length === 0) {
    return <Skeleton variant="text" count={8} />;
  }

  if (displayEntries.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="Nessuna attivita"
        description="Lo storico delle modifiche apparira qui."
      />
    );
  }

  return (
    <div className="space-y-1">
      <div className="relative border-l-2 border-slate-200 pl-6 dark:border-slate-700">
        {displayEntries.map((entry) => (
          <div key={entry.id} className="relative mb-6 last:mb-0">
            <div className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-accent-green bg-white dark:bg-slate-800" />
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {formatDateTime(entry.createdAt)}
              {entry.userName && (
                <span className="ml-2 font-medium text-slate-500 dark:text-slate-400">
                  {entry.userName}
                </span>
              )}
            </p>
            <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">
              {entry.description || entry.action}
            </p>
          </div>
        ))}
      </div>
      {data?.hasMore && (
        <div className="pt-2 text-center">
          <Button
            variant="ghost"
            loading={isLoading}
            onClick={() => setPage((p) => p + 1)}
          >
            Carica altro
          </Button>
        </div>
      )}
    </div>
  );
}

/* -- Catalog Tab -- */

interface CatalogProduct {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  supplierCode: string | null;
  currentPrice: number;
  isActive: boolean;
}

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

const IMPORT_TARGET_FIELDS = [
  { value: '', label: 'Non mappare' },
  { value: 'product_name', label: 'Nome Prodotto' },
  { value: 'supplier_code', label: 'Codice Fornitore' },
  { value: 'price', label: 'Prezzo' },
  { value: 'unit', label: 'Unita di Misura' },
];

function CatalogTab({ supplierId, supplierName }: { supplierId: string; supplierName: string }) {
  const [importing, setImporting] = useState(false);
  const [importStep, setImportStep] = useState(1);
  const [parseResult, setParseResult] = useState<CatalogImportParse | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, number>>({});
  const [importResult, setImportResult] = useState<CatalogImportResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current catalog products
  const { data: catalogData, isLoading } = useQuery<{ data: CatalogProduct[]; total: number }>({
    queryKey: ['supplier', supplierId, 'catalog'],
    queryFn: async () => {
      const res = await apiClient.get<any[]>('/products', {
        supplierId,
        pageSize: 100,
      });
      // Map to our CatalogProduct type
      const items: CatalogProduct[] = (res.data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        unit: p.unit,
        supplierCode: p.supplierCode || null,
        currentPrice: p.currentPrice ?? p.price ?? 0,
        isActive: p.isActive !== false,
      }));
      return { data: items, total: res.pagination?.total ?? items.length };
    },
  });

  const products = catalogData?.data ?? [];

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.supplierCode && p.supplierCode.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)),
    );
  }, [products, searchQuery]);

  // Step 1: Upload CSV
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

  // Step 2 -> 3: Confirm import
  const confirmMutation = useMutation({
    mutationFn: () =>
      apiClient.post<CatalogImportResult>('/price-lists/confirm', {
        supplierId,
        columnMapping,
        data: parseResult?.allData ?? [],
      }),
    onSuccess: (res) => {
      setImportResult(res.data);
      setImportStep(3);
      queryClient.invalidateQueries({ queryKey: ['supplier', supplierId, 'catalog'] });
      queryClient.invalidateQueries({ queryKey: ['supplier', supplierId] });
      toast('Catalogo importato con successo', 'success');
    },
    onError: () => toast("Errore nell'importazione del catalogo", 'error'),
  });

  const resetImport = () => {
    setImporting(false);
    setImportStep(1);
    setParseResult(null);
    setColumnMapping({});
    setImportResult(null);
  };

  const updateMappingField = (field: string, colIndex: number | '') => {
    setColumnMapping((prev) => {
      const next = { ...prev };
      // Remove field from old position
      Object.keys(next).forEach((k) => {
        if (k === field) delete next[k];
      });
      // Assign new position
      if (colIndex !== '') {
        next[field] = colIndex as number;
      }
      return next;
    });
  };

  // Catalog product table columns
  const catalogColumns: ColumnDef<CatalogProduct>[] = [
    {
      key: 'name',
      header: 'Prodotto',
      cell: (row) => (
        <span className="font-medium text-slate-900 dark:text-white">{row.name}</span>
      ),
    },
    {
      key: 'supplierCode',
      header: 'Cod. Fornitore',
      cell: (row) => (
        <span className="text-slate-500">{row.supplierCode || '-'}</span>
      ),
    },
    {
      key: 'category',
      header: 'Categoria',
      cell: (row) =>
        row.category ? <Badge variant="neutral">{row.category}</Badge> : <span className="text-slate-400">-</span>,
    },
    {
      key: 'unit',
      header: 'U.M.',
      cell: (row) => <span className="text-slate-500">{row.unit || '-'}</span>,
    },
    {
      key: 'currentPrice',
      header: 'Prezzo',
      cell: (row) => (
        <span className="tabular-nums font-medium">{formatCurrency(row.currentPrice)}</span>
      ),
    },
  ];

  // --- Import Wizard ---
  if (importing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Importa Catalogo - {supplierName}
          </h3>
          <Button variant="ghost" onClick={resetImport}>
            Annulla
          </Button>
        </div>

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
                Associa ciascun campo al colonna corrispondente del file.
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
                disabled={
                  !columnMapping.product_name && !columnMapping.supplier_code
                }
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
                Il catalogo di {supplierName} e stato aggiornato.
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
                <Button variant="outline" onClick={resetImport}>
                  Chiudi
                </Button>
                <Button
                  onClick={() => {
                    setImportStep(1);
                    setParseResult(null);
                    setImportResult(null);
                  }}
                >
                  Nuova Importazione
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    );
  }

  // --- Catalog List View ---
  if (isLoading) {
    return <div className="space-y-3"><Skeleton variant="rect" height={80} count={3} /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca nel catalogo..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-accent-green focus:outline-none focus:ring-1 focus:ring-accent-green dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
          />
        </div>
        <Button
          icon={<Upload className="h-4 w-4" />}
          onClick={() => setImporting(true)}
        >
          Importa Catalogo CSV/Excel
        </Button>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nessun prodotto nel catalogo"
          description="Importa il catalogo del fornitore tramite file CSV o Excel."
          actionLabel="Importa Catalogo"
          onAction={() => setImporting(true)}
        />
      ) : (
        <>
          <p className="text-sm text-slate-500">
            {filteredProducts.length} prodotti{searchQuery && ` trovati su ${products.length}`}
          </p>
          <DataTable columns={catalogColumns} data={filteredProducts} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('info');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const { data: supplier, isLoading, isError, refetch } = useQuery<SupplierDetail>({
    queryKey: ['supplier', id],
    queryFn: async () => {
      const res = await apiClient.get<SupplierDetail>(`/suppliers/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.del(`/suppliers/${id}`),
    onSuccess: () => {
      toast('Fornitore eliminato', 'success');
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      navigate('/suppliers');
    },
    onError: () => toast("Errore nell'eliminazione del fornitore", 'error'),
  });

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  /* --- Loading --- */
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" width="40%" height={32} />
        <Skeleton variant="rect" height={200} />
      </div>
    );
  }

  /* --- Error --- */
  if (isError || !supplier) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20"
      >
        <p className="mb-4 text-sm text-red-700 dark:text-red-300">
          Errore nel caricamento del fornitore.
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
      {/* --- Back link --- */}
      <Link
        to="/suppliers"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-accent-green"
      >
        <ArrowLeft className="h-4 w-4" />
        Fornitori
      </Link>

      {/* --- Header --- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {supplier.businessName}
          </h1>
          <Badge variant="info">{supplier.category}</Badge>
          {scoreBadge(supplier.score, true)}
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

      {/* --- Tabs --- */}
      <Tabs tabs={TAB_ITEMS} value={activeTab} onChange={setActiveTab} />

      {/* --- Tab content --- */}
      <div className="min-h-[300px]">
        {activeTab === 'info' && (
          <InfoTab supplier={supplier} onUpdate={handleRefresh} />
        )}
        {activeTab === 'contacts' && <ContactsTab supplierId={supplier.id} />}
        {activeTab === 'catalog' && (
          <CatalogTab supplierId={supplier.id} supplierName={supplier.businessName} />
        )}
        {activeTab === 'documents' && <DocumentsTab supplierId={supplier.id} />}
        {activeTab === 'orders' && <OrdersTab supplierId={supplier.id} />}
        {activeTab === 'performance' && (
          <Suspense fallback={<Skeleton variant="rect" height={400} />}>
            <SupplierScorecard supplierId={supplier.id} />
          </Suspense>
        )}
        {activeTab === 'history' && <HistoryTab supplierId={supplier.id} />}
      </div>

      {/* --- Delete confirmation --- */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Elimina Fornitore"
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
          Sei sicuro di voler eliminare <strong>{supplier.businessName}</strong>?
          Questa azione non puo essere annullata.
        </p>
      </Modal>
    </motion.div>
  );
}

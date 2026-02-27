import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  CreditCard,
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock,
  Banknote,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatDate } from '@/utils/format-date';
import { formatCurrency } from '@/utils/format-currency';
import { cn } from '@/utils/cn';
import { Badge, Button, Card, Input, Modal, Skeleton, useToast } from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PaymentInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  totalAmount: number;
  dueDate: string;
  status: string;
  isOverdue: boolean;
}

interface PaymentWeek {
  weekNumber: number;
  startDate: string;
  endDate: string;
  invoices: PaymentInvoice[];
  weekTotal: number;
}

interface PaymentSummary {
  dueThisWeek: number;
  dueNext30Days: number;
  totalOverdue: number;
  overdueCount: number;
}

interface PaymentsData {
  overdue: PaymentInvoice[];
  weeks: PaymentWeek[];
  summary: PaymentSummary;
}

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<string, string> = {
  to_pay: 'Da Pagare',
  paid: 'Pagata',
  overdue: 'Scaduta',
  disputed: 'Contestata',
};

const STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'success' | 'error'> = {
  to_pay: 'warning',
  paid: 'success',
  overdue: 'error',
  disputed: 'error',
};

/* ------------------------------------------------------------------ */
/*  Invoice Payment Card                                               */
/* ------------------------------------------------------------------ */

function InvoicePaymentCard({
  invoice,
  onMarkPaid,
  isMarking,
}: {
  invoice: PaymentInvoice;
  onMarkPaid: (invoiceId: string) => void;
  isMarking: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between',
        invoice.isOverdue
          ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10'
          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800',
      )}
    >
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-slate-900 dark:text-white">
            {invoice.supplierName}
          </p>
          {invoice.isOverdue && (
            <Badge variant="error" size="sm">SCADUTA</Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span>#{invoice.invoiceNumber}</span>
          <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
            {formatCurrency(invoice.totalAmount)}
          </span>
          <span className={cn(
            'flex items-center gap-1 tabular-nums',
            invoice.isOverdue ? 'text-red-600 dark:text-red-400' : '',
          )}>
            <Calendar className="h-3.5 w-3.5" />
            Scad. {formatDate(invoice.dueDate)}
          </span>
          <Badge variant={(STATUS_VARIANT[invoice.status] as any) || 'neutral'} size="sm">
            {STATUS_LABEL[invoice.status] || invoice.status}
          </Badge>
        </div>
      </div>
      {invoice.status !== 'paid' && (
        <Button
          variant="primary"
          size="md"
          icon={<CheckCircle className="h-4 w-4" />}
          loading={isMarking}
          onClick={() => onMarkPaid(invoice.id)}
          className="min-h-[48px]"
        >
          Segna come Pagata
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function InvoicePaymentsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showPayment, setShowPayment] = useState(false);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [paymentRef, setPaymentRef] = useState('');

  /* --- Fetch payments data --- */
  const { data, isLoading, isError, refetch } = useQuery<PaymentsData>({
    queryKey: ['invoices', 'payments'],
    queryFn: async () => {
      const res = await apiClient.get<PaymentsData>('/invoices/payments');
      return res.data;
    },
  });

  /* --- Mark as paid mutation --- */
  const markPaidMutation = useMutation({
    mutationFn: async ({ invoiceId, reference }: { invoiceId: string; reference: string }) => {
      await apiClient.post(`/invoices/${invoiceId}/pay`, { paymentReference: reference });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', 'payments'] });
      toast('Fattura segnata come pagata', 'success');
      setShowPayment(false);
      setPayingInvoiceId(null);
      setPaymentRef('');
    },
    onError: () => {
      toast('Errore nel registrare il pagamento', 'error');
    },
  });

  const handleMarkPaid = (invoiceId: string) => {
    setPayingInvoiceId(invoiceId);
    setShowPayment(true);
  };

  const confirmPayment = () => {
    if (payingInvoiceId) {
      markPaidMutation.mutate({
        invoiceId: payingInvoiceId,
        reference: paymentRef,
      });
    }
  };

  /* --- Loading --- */
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton variant="rect" height={120} />
        <Skeleton variant="rect" height={200} />
        <Skeleton variant="rect" height={200} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20"
      >
        <p className="mb-4 text-sm text-red-700 dark:text-red-300">
          Errore nel caricamento dei pagamenti.
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
    >
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <CreditCard className="h-7 w-7 text-accent-green" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Pagamenti
        </h1>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/20">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Scadenza questa settimana</p>
              <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                {formatCurrency(data.summary.dueThisWeek)}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/20">
              <Banknote className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Prossimi 30 giorni</p>
              <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                {formatCurrency(data.summary.dueNext30Days)}
              </p>
            </div>
          </div>
        </Card>
        <Card className={data.summary.totalOverdue > 0 ? 'border-red-200 dark:border-red-800' : ''}>
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              data.summary.totalOverdue > 0
                ? 'bg-red-100 dark:bg-red-900/20'
                : 'bg-green-100 dark:bg-green-900/20',
            )}>
              <AlertCircle className={cn(
                'h-5 w-5',
                data.summary.totalOverdue > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400',
              )} />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Totale Scaduto ({data.summary.overdueCount})
              </p>
              <p className={cn(
                'text-lg font-bold tabular-nums',
                data.summary.totalOverdue > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400',
              )}>
                {formatCurrency(data.summary.totalOverdue)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Overdue section */}
      {data.overdue.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">
              Scadute ({data.overdue.length})
            </h2>
          </div>
          <div className="space-y-3">
            {data.overdue.map((inv) => (
              <InvoicePaymentCard
                key={inv.id}
                invoice={inv}
                onMarkPaid={handleMarkPaid}
                isMarking={markPaidMutation.isPending && payingInvoiceId === inv.id}
              />
            ))}
          </div>
        </section>
      )}

      {/* Weekly groups */}
      {data.weeks.map((week) => (
        <section key={week.weekNumber} className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Settimana {week.weekNumber} ({formatDate(week.startDate)} - {formatDate(week.endDate)})
            </h2>
            <span className="text-sm font-medium tabular-nums text-slate-500 dark:text-slate-400">
              Totale: {formatCurrency(week.weekTotal)}
            </span>
          </div>
          <div className="space-y-3">
            {week.invoices.map((inv) => (
              <InvoicePaymentCard
                key={inv.id}
                invoice={inv}
                onMarkPaid={handleMarkPaid}
                isMarking={markPaidMutation.isPending && payingInvoiceId === inv.id}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Empty state */}
      {data.overdue.length === 0 && data.weeks.length === 0 && (
        <div className="py-16 text-center">
          <CheckCircle className="mx-auto mb-4 h-12 w-12 text-green-500" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Nessun pagamento in sospeso
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tutte le fatture sono state pagate.
          </p>
        </div>
      )}

      {/* Payment confirmation modal */}
      <Modal
        isOpen={showPayment}
        onClose={() => {
          setShowPayment(false);
          setPayingInvoiceId(null);
          setPaymentRef('');
        }}
        title="Conferma Pagamento"
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowPayment(false);
                setPayingInvoiceId(null);
                setPaymentRef('');
              }}
            >
              Annulla
            </Button>
            <Button
              variant="primary"
              loading={markPaidMutation.isPending}
              onClick={confirmPayment}
            >
              Conferma Pagamento
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Inserisci il riferimento del pagamento per registrare la fattura come pagata.
          </p>
          <Input
            label="Riferimento Pagamento"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder="Es. Bonifico SEPA 12345, CRO, ecc."
          />
        </div>
      </Modal>
    </motion.div>
  );
}

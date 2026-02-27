import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  GitCompare,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatCurrency } from '@/utils/format-currency';
import { cn } from '@/utils/cn';
import { Button, Card, Badge, Modal, TextArea, Skeleton, useToast } from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ReconcileLine {
  id: string;
  productName: string;
  order: {
    quantity: number;
    unitPrice: number;
    total: number;
  } | null;
  receiving: {
    quantity: number;
    unitPrice: number;
    total: number;
  } | null;
  invoice: {
    quantity: number;
    unitPrice: number;
    total: number;
  } | null;
  discrepancies: ReconcileDiscrepancy[];
}

interface ReconcileDiscrepancy {
  type: 'price' | 'quantity' | 'not_ordered' | 'vat';
  description: string;
  amount: number;
}

interface ReconcileData {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  orderId: string;
  orderNumber: string;
  receivingId: string;
  supplierName: string;
  lines: ReconcileLine[];
  totals: {
    orderTotal: number;
    receivingTotal: number;
    invoiceTotal: number;
    netDiscrepancy: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Discrepancy type labels                                            */
/* ------------------------------------------------------------------ */

const DISCREPANCY_LABEL: Record<string, string> = {
  price: 'Sovrapprezzo',
  quantity: 'Quantita',
  not_ordered: 'Non Ordinato',
  vat: 'IVA',
};

const DISCREPANCY_VARIANT: Record<string, 'error' | 'warning' | 'info'> = {
  price: 'error',
  quantity: 'warning',
  not_ordered: 'error',
  vat: 'info',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function InvoiceReconcilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showDispute, setShowDispute] = useState(false);
  const [disputeNotes, setDisputeNotes] = useState('');

  /* --- Fetch reconciliation data --- */
  const { data, isLoading, isError, refetch } = useQuery<ReconcileData>({
    queryKey: ['invoice', id, 'reconcile'],
    queryFn: async () => {
      const res = await apiClient.get<ReconcileData>(`/invoices/${id}/reconcile`);
      return res.data;
    },
    enabled: !!id,
  });

  /* --- Approve payment --- */
  const approveMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post(`/invoices/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      toast('Pagamento approvato con successo!', 'success');
      navigate('/invoices');
    },
    onError: () => {
      toast('Errore nell\'approvazione', 'error');
    },
  });

  /* --- Dispute --- */
  const disputeMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post(`/invoices/${id}/dispute`, { notes: disputeNotes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      toast('Fattura contestata', 'warning');
      setShowDispute(false);
      navigate('/invoices');
    },
    onError: () => {
      toast('Errore nella contestazione', 'error');
    },
  });

  /* --- Loading --- */
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton variant="rect" height={60} />
        <Skeleton variant="rect" height={400} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20">
        <p className="mb-4 text-sm text-red-700 dark:text-red-300">
          Errore nel caricamento della riconciliazione.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Riprova
        </Button>
      </div>
    );
  }

  const hasDiscrepancies = data.totals.netDiscrepancy !== 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate(`/invoices/${id}`)}
          className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna alla fattura
        </button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <GitCompare className="h-7 w-7 text-accent-green" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Riconciliazione
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {data.supplierName} &middot; Fattura #{data.invoiceNumber} &middot; Ordine #{data.orderNumber}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="danger"
              icon={<XCircle className="h-4 w-4" />}
              onClick={() => setShowDispute(true)}
            >
              Contesta
            </Button>
            <Button
              variant="primary"
              icon={<CheckCircle className="h-4 w-4" />}
              loading={approveMutation.isPending}
              onClick={() => approveMutation.mutate()}
            >
              Approva Pagamento
            </Button>
          </div>
        </div>
      </div>

      {/* Three-column comparison table */}
      <Card className="mb-6 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Prodotto
                </th>
                <th
                  colSpan={2}
                  className="border-l border-slate-200 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-blue-600 dark:border-slate-700 dark:text-blue-400"
                >
                  Ordine
                </th>
                <th
                  colSpan={2}
                  className="border-l border-slate-200 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:border-slate-700 dark:text-cyan-400"
                >
                  Ricezione
                </th>
                <th
                  colSpan={2}
                  className="border-l border-slate-200 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-violet-600 dark:border-slate-700 dark:text-violet-400"
                >
                  Fattura
                </th>
                <th className="border-l border-slate-200 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Stato
                </th>
              </tr>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-800/30">
                <th className="px-4 py-1" />
                <th className="border-l border-slate-200 px-4 py-1 text-center dark:border-slate-700">Qta</th>
                <th className="px-4 py-1 text-right">Prezzo</th>
                <th className="border-l border-slate-200 px-4 py-1 text-center dark:border-slate-700">Qta</th>
                <th className="px-4 py-1 text-right">Prezzo</th>
                <th className="border-l border-slate-200 px-4 py-1 text-center dark:border-slate-700">Qta</th>
                <th className="px-4 py-1 text-right">Prezzo</th>
                <th className="border-l border-slate-200 px-4 py-1 dark:border-slate-700" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {data.lines.map((line) => {
                const hasIssue = line.discrepancies.length > 0;
                return (
                  <tr
                    key={line.id}
                    className={cn(
                      'transition-colors',
                      hasIssue
                        ? 'bg-red-50/50 dark:bg-red-900/5'
                        : 'bg-white dark:bg-slate-800',
                    )}
                  >
                    {/* Product name */}
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                      {line.productName}
                    </td>

                    {/* Order */}
                    <td className="border-l border-slate-200 px-4 py-3 text-center tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-400">
                      {line.order ? line.order.quantity : '-'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {line.order ? formatCurrency(line.order.unitPrice) : '-'}
                    </td>

                    {/* Receiving */}
                    <td
                      className={cn(
                        'border-l border-slate-200 px-4 py-3 text-center tabular-nums dark:border-slate-700',
                        line.receiving &&
                          line.order &&
                          line.receiving.quantity !== line.order.quantity
                          ? 'font-semibold text-amber-600 dark:text-amber-400'
                          : 'text-slate-600 dark:text-slate-400',
                      )}
                    >
                      {line.receiving ? line.receiving.quantity : '-'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {line.receiving ? formatCurrency(line.receiving.unitPrice) : '-'}
                    </td>

                    {/* Invoice */}
                    <td
                      className={cn(
                        'border-l border-slate-200 px-4 py-3 text-center tabular-nums dark:border-slate-700',
                        line.invoice &&
                          line.order &&
                          line.invoice.quantity !== line.order.quantity
                          ? 'font-semibold text-amber-600 dark:text-amber-400'
                          : 'text-slate-600 dark:text-slate-400',
                      )}
                    >
                      {line.invoice ? line.invoice.quantity : '-'}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right tabular-nums',
                        line.invoice &&
                          line.order &&
                          line.invoice.unitPrice !== line.order.unitPrice
                          ? 'font-semibold text-red-600 dark:text-red-400'
                          : 'text-slate-600 dark:text-slate-400',
                      )}
                    >
                      {line.invoice ? formatCurrency(line.invoice.unitPrice) : '-'}
                    </td>

                    {/* Status */}
                    <td className="border-l border-slate-200 px-4 py-3 dark:border-slate-700">
                      {line.discrepancies.length === 0 ? (
                        <div className="flex justify-center">
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        </div>
                      ) : (
                        <div className="flex flex-wrap justify-center gap-1">
                          {line.discrepancies.map((d, i) => (
                            <Badge
                              key={i}
                              variant={DISCREPANCY_VARIANT[d.type] || 'warning'}
                              size="sm"
                            >
                              {DISCREPANCY_LABEL[d.type] || d.type}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Summary bar */}
      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-blue-50 p-4 text-center dark:bg-blue-900/10">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
              Totale Ordine
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-blue-700 dark:text-blue-300">
              {formatCurrency(data.totals.orderTotal)}
            </p>
          </div>
          <div className="rounded-lg bg-cyan-50 p-4 text-center dark:bg-cyan-900/10">
            <p className="text-xs font-medium text-cyan-600 dark:text-cyan-400">
              Totale Ricevuto
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-cyan-700 dark:text-cyan-300">
              {formatCurrency(data.totals.receivingTotal)}
            </p>
          </div>
          <div className="rounded-lg bg-violet-50 p-4 text-center dark:bg-violet-900/10">
            <p className="text-xs font-medium text-violet-600 dark:text-violet-400">
              Totale Fatturato
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-violet-700 dark:text-violet-300">
              {formatCurrency(data.totals.invoiceTotal)}
            </p>
          </div>
          <div
            className={cn(
              'rounded-lg p-4 text-center',
              hasDiscrepancies
                ? 'bg-red-50 dark:bg-red-900/10'
                : 'bg-green-50 dark:bg-green-900/10',
            )}
          >
            <p
              className={cn(
                'text-xs font-medium',
                hasDiscrepancies
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400',
              )}
            >
              Discrepanza Netta
            </p>
            <p
              className={cn(
                'mt-1 text-xl font-bold tabular-nums',
                hasDiscrepancies
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-green-700 dark:text-green-300',
              )}
            >
              {data.totals.netDiscrepancy > 0 ? '+' : ''}
              {formatCurrency(data.totals.netDiscrepancy)}
            </p>
          </div>
        </div>
      </Card>

      {/* Dispute modal */}
      <Modal
        isOpen={showDispute}
        onClose={() => setShowDispute(false)}
        title="Contesta Fattura"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowDispute(false)}>
              Annulla
            </Button>
            <Button
              variant="danger"
              loading={disputeMutation.isPending}
              disabled={!disputeNotes.trim()}
              onClick={() => disputeMutation.mutate()}
            >
              Invia Contestazione
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Indica il motivo della contestazione della fattura #{data.invoiceNumber} di {data.supplierName}.
          </p>
          <TextArea
            label="Note contestazione"
            value={disputeNotes}
            onChange={(e) => setDisputeNotes(e.target.value)}
            placeholder="Descrivi le discrepanze riscontrate..."
            rows={4}
          />
        </div>
      </Modal>
    </motion.div>
  );
}

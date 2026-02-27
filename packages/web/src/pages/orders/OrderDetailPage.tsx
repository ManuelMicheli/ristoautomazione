import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  MoreVertical,
  Pencil,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  PackageCheck,
  Flame,
  Clock,
  FileText,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatCurrency } from '@/utils/format-currency';
import { formatDate, formatDateTime } from '@/utils/format-date';
import { cn } from '@/utils/cn';
import {
  Badge,
  Button,
  Card,
  DataTable,
  DropdownMenu,
  Input,
  Modal,
  Skeleton,
  TextArea,
  useToast,
  type ColumnDef,
} from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OrderLine {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

interface StatusEvent {
  id: string;
  status: string;
  timestamp: string;
  userName: string | null;
  notes: string | null;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  supplierId: string;
  supplierName: string;
  date: string;
  expectedDeliveryDate: string | null;
  totalAmount: number;
  isUrgent: boolean;
  notes: string;
  createdByName: string;
  approvedByName: string | null;
  lines: OrderLine[];
  statusHistory: StatusEvent[];
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_VARIANT: Record<string, 'draft' | 'pending_approval' | 'approved' | 'sent' | 'confirmed' | 'received' | 'closed' | 'cancelled' | 'neutral'> = {
  draft: 'draft',
  pending_approval: 'pending_approval',
  approved: 'approved',
  sent: 'sent',
  confirmed: 'confirmed',
  partially_received: 'neutral',
  received: 'received',
  closed: 'closed',
  cancelled: 'cancelled',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Bozza',
  pending_approval: 'In Approvazione',
  approved: 'Approvato',
  sent: 'Inviato',
  confirmed: 'Confermato',
  partially_received: 'Ricevuto Parz.',
  received: 'Ricevuto',
  closed: 'Chiuso',
  cancelled: 'Annullato',
};

const STATUS_ICON: Record<string, typeof Clock> = {
  draft: FileText,
  pending_approval: Clock,
  approved: CheckCircle2,
  sent: Send,
  confirmed: CheckCircle2,
  received: PackageCheck,
  closed: CheckCircle2,
  cancelled: XCircle,
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatusTimeline({ events }: { events: StatusEvent[] }) {
  return (
    <div className="relative border-l-2 border-slate-200 pl-6 dark:border-slate-700">
      {events.map((event, i) => {
        const Icon = STATUS_ICON[event.status] || Clock;
        const isLast = i === 0;
        return (
          <div key={event.id} className="relative mb-6 last:mb-0">
            <div
              className={cn(
                'absolute -left-[31px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full',
                isLast
                  ? 'bg-accent-green text-white'
                  : 'border-2 border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800',
              )}
            >
              {isLast && <Icon className="h-2.5 w-2.5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[event.status] || 'neutral'} size="sm">
                  {STATUS_LABEL[event.status] || event.status}
                </Badge>
                <span className="text-xs text-slate-400">
                  {formatDateTime(event.timestamp)}
                </span>
              </div>
              {event.userName && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {event.userName}
                </p>
              )}
              {event.notes && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {event.notes}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const { data: order, isLoading, isError, refetch } = useQuery<OrderDetail>({
    queryKey: ['order', id],
    queryFn: async () => {
      const res = await apiClient.get<OrderDetail>(`/orders/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  const actionMutation = useMutation({
    mutationFn: ({ action, data }: { action: string; data?: Record<string, unknown> }) =>
      apiClient.post(`/orders/${id}/${action}`, data),
    onSuccess: () => {
      toast('Ordine aggiornato', 'success');
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => toast("Errore nell'aggiornamento dell'ordine", 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.del(`/orders/${id}`),
    onSuccess: () => {
      toast('Ordine eliminato', 'success');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigate('/orders');
    },
    onError: () => toast("Errore nell'eliminazione dell'ordine", 'error'),
  });

  const handleReject = () => {
    actionMutation.mutate(
      { action: 'reject', data: { reason: rejectReason } },
      {
        onSuccess: () => {
          setRejectModalOpen(false);
          setRejectReason('');
          toast('Ordine rifiutato', 'success');
          queryClient.invalidateQueries({ queryKey: ['order', id] });
        },
      },
    );
  };

  /* --- Line columns --- */
  const lineColumns: ColumnDef<OrderLine>[] = useMemo(
    () => [
      {
        key: 'productName',
        header: 'Prodotto',
        cell: (row) => (
          <Link
            to={`/products/${row.productId}`}
            className="font-medium text-slate-900 hover:text-accent-green dark:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            {row.productName}
          </Link>
        ),
      },
      {
        key: 'quantity',
        header: 'Quantita',
        cell: (row) => (
          <span className="tabular-nums">{row.quantity}</span>
        ),
      },
      {
        key: 'unit',
        header: 'UM',
        cell: (row) => (
          <Badge variant="neutral" size="sm">{row.unit}</Badge>
        ),
      },
      {
        key: 'unitPrice',
        header: 'Prezzo',
        cell: (row) => (
          <span className="tabular-nums">{formatCurrency(row.unitPrice)}</span>
        ),
      },
      {
        key: 'totalPrice',
        header: 'Totale',
        cell: (row) => (
          <span className="font-medium tabular-nums">{formatCurrency(row.totalPrice)}</span>
        ),
      },
    ],
    [],
  );

  /* --- Loading --- */
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" width="40%" height={32} />
        <Skeleton variant="rect" height={200} />
        <Skeleton variant="rect" height={300} />
      </div>
    );
  }

  /* --- Error --- */
  if (isError || !order) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20"
      >
        <p className="mb-4 text-sm text-red-700 dark:text-red-300">
          Errore nel caricamento dell'ordine.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Riprova
        </Button>
      </motion.div>
    );
  }

  /* --- Action buttons based on status --- */
  const renderActions = () => {
    const actions: React.ReactNode[] = [];

    if (order.status === 'draft') {
      actions.push(
        <Button
          key="edit"
          variant="outline"
          icon={<Pencil className="h-4 w-4" />}
          onClick={() => navigate(`/orders/${order.id}/edit`)}
        >
          Modifica
        </Button>,
        <Button
          key="submit"
          icon={<Send className="h-4 w-4" />}
          onClick={() => actionMutation.mutate({ action: 'submit' })}
          loading={actionMutation.isPending}
        >
          Invia per Approvazione
        </Button>,
      );
    }

    if (order.status === 'pending_approval') {
      actions.push(
        <Button
          key="approve"
          icon={<CheckCircle2 className="h-4 w-4" />}
          onClick={() => actionMutation.mutate({ action: 'approve' })}
          loading={actionMutation.isPending}
        >
          Approva
        </Button>,
        <Button
          key="reject"
          variant="danger"
          icon={<XCircle className="h-4 w-4" />}
          onClick={() => setRejectModalOpen(true)}
        >
          Rifiuta
        </Button>,
      );
    }

    if (order.status === 'approved') {
      actions.push(
        <Button
          key="send"
          icon={<Send className="h-4 w-4" />}
          onClick={() => actionMutation.mutate({ action: 'send' })}
          loading={actionMutation.isPending}
        >
          Invia al Fornitore
        </Button>,
      );
    }

    if (order.status === 'sent' || order.status === 'confirmed') {
      actions.push(
        <Button
          key="receive"
          icon={<PackageCheck className="h-4 w-4" />}
          onClick={() => navigate(`/receiving/new?orderId=${order.id}`)}
        >
          Registra Ricezione
        </Button>,
      );
    }

    return actions;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Back */}
      <Link
        to="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-accent-green"
      >
        <ArrowLeft className="h-4 w-4" />
        Ordini
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Ordine {order.orderNumber}
            </h1>
            <Badge variant={STATUS_VARIANT[order.status] || 'neutral'}>
              {STATUS_LABEL[order.status] || order.status}
            </Badge>
            {order.isUrgent && (
              <Badge variant="error">
                <Flame className="mr-1 h-3 w-3" />
                Urgente
              </Badge>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
            <span>
              Fornitore:{' '}
              <Link
                to={`/suppliers/${order.supplierId}`}
                className="font-medium text-slate-700 hover:text-accent-green dark:text-slate-300"
              >
                {order.supplierName}
              </Link>
            </span>
            <span>Data: {formatDate(order.date)}</span>
            {order.expectedDeliveryDate && (
              <span>Consegna prevista: {formatDate(order.expectedDeliveryDate)}</span>
            )}
            <span>Creato da: {order.createdByName}</span>
            {order.approvedByName && (
              <span>Approvato da: {order.approvedByName}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {renderActions()}
          <DropdownMenu
            trigger={
              <Button variant="outline" icon={<MoreVertical className="h-4 w-4" />}>
                Altro
              </Button>
            }
            items={[
              ...(order.status === 'draft'
                ? [
                    {
                      label: 'Elimina',
                      icon: <Trash2 className="h-4 w-4" />,
                      variant: 'danger' as const,
                      onClick: () => setDeleteModalOpen(true),
                    },
                  ]
                : []),
              ...(order.status !== 'cancelled' && order.status !== 'closed'
                ? [
                    {
                      label: 'Annulla Ordine',
                      icon: <XCircle className="h-4 w-4" />,
                      variant: 'danger' as const,
                      onClick: () => actionMutation.mutate({ action: 'cancel' }),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>

      {/* Order Lines */}
      <Card header="Righe Ordine">
        <DataTable columns={lineColumns} data={order.lines} />
        <div className="mt-4 flex justify-end border-t border-slate-200 pt-4 dark:border-slate-700">
          <div className="text-right">
            <p className="text-sm text-slate-500">Totale Ordine</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(order.totalAmount)}
            </p>
          </div>
        </div>
      </Card>

      {/* Notes */}
      {order.notes && (
        <Card header="Note">
          <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
            {order.notes}
          </p>
        </Card>
      )}

      {/* Status History */}
      <Card header="Storico Stato">
        {order.statusHistory && order.statusHistory.length > 0 ? (
          <StatusTimeline events={order.statusHistory} />
        ) : (
          <p className="text-sm text-slate-400">Nessuno storico disponibile.</p>
        )}
      </Card>

      {/* Delete Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Elimina Ordine"
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
          Sei sicuro di voler eliminare l'ordine <strong>{order.orderNumber}</strong>?
          Questa azione non puo essere annullata.
        </p>
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Rifiuta Ordine"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectModalOpen(false)}>
              Annulla
            </Button>
            <Button
              variant="danger"
              loading={actionMutation.isPending}
              onClick={handleReject}
              disabled={!rejectReason.trim()}
            >
              Rifiuta
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Indica il motivo del rifiuto dell'ordine <strong>{order.orderNumber}</strong>.
          </p>
          <TextArea
            label="Motivo del Rifiuto *"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="Specifica il motivo..."
          />
        </div>
      </Modal>
    </motion.div>
  );
}

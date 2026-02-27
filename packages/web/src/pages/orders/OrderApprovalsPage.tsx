import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ShoppingCart,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatCurrency } from '@/utils/format-currency';
import { formatDate, formatRelative } from '@/utils/format-date';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Skeleton,
  TextArea,
  useToast,
} from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PendingOrder {
  id: string;
  orderNumber: string;
  supplierName: string;
  supplierId: string;
  totalAmount: number;
  lineCount: number;
  createdByName: string;
  date: string;
  createdAt: string;
  notes: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function OrderApprovalsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data: orders = [], isLoading } = useQuery<PendingOrder[]>({
    queryKey: ['orders', 'pending-approvals'],
    queryFn: async () => {
      const res = await apiClient.get<PendingOrder[]>('/orders', {
        status: 'pending_approval',
        pageSize: 50,
      });
      return res.data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiClient.post(`/orders/${orderId}/approve`),
    onSuccess: () => {
      toast('Ordine approvato', 'success');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => toast("Errore nell'approvazione dell'ordine", 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      apiClient.post(`/orders/${orderId}/reject`, { reason }),
    onSuccess: () => {
      toast('Ordine rifiutato', 'success');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setRejectModalOpen(false);
      setRejectOrderId(null);
      setRejectReason('');
    },
    onError: () => toast('Errore nel rifiuto dell\'ordine', 'error'),
  });

  const openRejectModal = (orderId: string) => {
    setRejectOrderId(orderId);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" width="40%" height={32} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton variant="rect" height={200} />
          <Skeleton variant="rect" height={200} />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Clock className="h-7 w-7 text-accent-green" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Approvazioni Pendenti
        </h1>
        {orders.length > 0 && (
          <Badge variant="warning">{orders.length}</Badge>
        )}
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nessuna approvazione pendente"
          description="Tutti gli ordini sono stati gestiti. Ben fatto!"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {orders.map((order) => (
            <Card key={order.id} hoverable onClick={() => navigate(`/orders/${order.id}`)}>
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {order.orderNumber}
                    </p>
                    <p className="text-sm text-slate-500">{order.supplierName}</p>
                  </div>
                  <Badge variant="pending_approval">In Approvazione</Badge>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Totale</p>
                    <p className="font-medium tabular-nums text-slate-900 dark:text-white">
                      {formatCurrency(order.totalAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Articoli</p>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {order.lineCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Creato da</p>
                    <p className="text-slate-700 dark:text-slate-300">
                      {order.createdByName}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Data</p>
                    <p className="text-slate-700 dark:text-slate-300">
                      {formatRelative(order.createdAt)}
                    </p>
                  </div>
                </div>

                {order.notes && (
                  <p className="text-xs text-slate-400 line-clamp-2">
                    Note: {order.notes}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                  <Button
                    size="sm"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      approveMutation.mutate(order.id);
                    }}
                    loading={approveMutation.isPending}
                    className="flex-1"
                  >
                    Approva
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<XCircle className="h-4 w-4" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      openRejectModal(order.id);
                    }}
                    className="flex-1"
                  >
                    Rifiuta
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

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
              loading={rejectMutation.isPending}
              onClick={() =>
                rejectOrderId &&
                rejectMutation.mutate({
                  orderId: rejectOrderId,
                  reason: rejectReason,
                })
              }
              disabled={!rejectReason.trim()}
            >
              Rifiuta
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Specifica il motivo del rifiuto. Il richiedente verra notificato.
          </p>
          <TextArea
            label="Motivo del Rifiuto *"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="es. Budget insufficiente, fornitore alternativo preferito..."
          />
        </div>
      </Modal>
    </motion.div>
  );
}

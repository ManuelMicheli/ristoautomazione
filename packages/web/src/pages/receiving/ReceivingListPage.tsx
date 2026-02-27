import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Truck,
  Calendar,
  Package,
  ArrowRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatDate, formatDateShort } from '@/utils/format-date';
import { formatCurrency } from '@/utils/format-currency';
import { cn } from '@/utils/cn';
import { Badge, Button, Card, Skeleton, EmptyState, useToast } from '@/components/ui';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ExpectedDelivery {
  id: string;
  orderId: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  expectedDate: string;
  totalAmount: number;
  itemCount: number;
  status: string;
}

interface RecentReceiving {
  id: string;
  orderId: string;
  orderNumber: string;
  supplierName: string;
  receivedDate: string;
  itemCount: number;
  nonConformityCount: number;
  status: string;
}

interface ExpectedResponse {
  today: ExpectedDelivery[];
  thisWeek: ExpectedDelivery[];
  upcoming: ExpectedDelivery[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function todayItalian(): string {
  return format(new Date(), "EEEE d MMMM yyyy", { locale: it });
}

/* ------------------------------------------------------------------ */
/*  Delivery Card                                                      */
/* ------------------------------------------------------------------ */

function DeliveryCard({
  delivery,
  onStart,
  isStarting,
}: {
  delivery: ExpectedDelivery;
  onStart: (orderId: string) => void;
  isStarting: boolean;
}) {
  return (
    <Card className="min-h-[5rem]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 space-y-1">
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {delivery.supplierName}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <span className="font-medium">#{delivery.orderNumber}</span>
            <span className="tabular-nums">{formatCurrency(delivery.totalAmount)}</span>
            <span className="flex items-center gap-1">
              <Package className="h-3.5 w-3.5" />
              {delivery.itemCount} articoli
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatDateShort(delivery.expectedDate)}
            </span>
          </div>
        </div>
        <Button
          variant="primary"
          size="lg"
          icon={<ArrowRight className="h-5 w-5" />}
          iconPosition="right"
          loading={isStarting}
          onClick={() => onStart(delivery.orderId)}
          className="min-h-[48px] min-w-[180px]"
        >
          Inizia Ricezione
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent Receiving Card                                              */
/* ------------------------------------------------------------------ */

function RecentCard({ receiving }: { receiving: RecentReceiving }) {
  const navigate = useNavigate();
  return (
    <Card
      hoverable
      onClick={() => navigate(`/receiving/${receiving.id}/detail`)}
      className="cursor-pointer"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {receiving.supplierName}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {formatDate(receiving.receivedDate)} &middot; #{receiving.orderNumber} &middot; {receiving.itemCount} articoli
          </p>
        </div>
        <div className="flex items-center gap-2">
          {receiving.nonConformityCount > 0 ? (
            <Badge variant="error">
              <AlertTriangle className="mr-1 h-3 w-3" />
              {receiving.nonConformityCount} NC
            </Badge>
          ) : (
            <Badge variant="success">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              OK
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Section Header                                                     */
/* ------------------------------------------------------------------ */

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-5 w-5 text-slate-500 dark:text-slate-400" />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
      <Badge variant="neutral">{count}</Badge>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ReceivingListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  /* --- Expected deliveries query --- */
  const {
    data: expected,
    isLoading: loadingExpected,
    isError: errorExpected,
    refetch: refetchExpected,
  } = useQuery<ExpectedResponse>({
    queryKey: ['receivings', 'expected'],
    queryFn: async () => {
      const res = await apiClient.get<ExpectedResponse>('/receivings/expected');
      return res.data;
    },
  });

  /* --- Recent receivings query --- */
  const {
    data: recents,
    isLoading: loadingRecent,
  } = useQuery<RecentReceiving[]>({
    queryKey: ['receivings', 'recent'],
    queryFn: async () => {
      const res = await apiClient.get<RecentReceiving[]>('/receivings', {
        pageSize: 5,
        sortBy: 'receivedDate',
        sortDir: 'desc',
      });
      return res.data;
    },
  });

  /* --- Start receiving mutation --- */
  const startMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiClient.post<{ id: string }>('/receivings', { orderId });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['receivings'] });
      navigate(`/receiving/${data.id}`);
    },
    onError: () => {
      toast('Errore nell\'avvio della ricezione. Riprova.', 'error');
    },
  });

  /* --- Sections data --- */
  const todayDeliveries = useMemo(() => expected?.today ?? [], [expected]);
  const weekDeliveries = useMemo(() => expected?.thisWeek ?? [], [expected]);
  const upcomingDeliveries = useMemo(() => expected?.upcoming ?? [], [expected]);
  const hasDeliveries = todayDeliveries.length + weekDeliveries.length + upcomingDeliveries.length > 0;

  /* --- Error --- */
  if (errorExpected) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20"
      >
        <p className="mb-4 text-sm text-red-700 dark:text-red-300">
          Errore nel caricamento delle consegne previste.
        </p>
        <Button variant="outline" onClick={() => refetchExpected()}>
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
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Truck className="h-7 w-7 text-accent-green" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Ricezione Merce
            </h1>
            <p className="text-sm capitalize text-slate-500 dark:text-slate-400">
              {todayItalian()}
            </p>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loadingExpected && (
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} variant="rect" height={80} />
          ))}
        </div>
      )}

      {/* No deliveries */}
      {!loadingExpected && !hasDeliveries && (
        <EmptyState
          icon={Truck}
          title="Nessuna consegna prevista"
          description="Non ci sono consegne in programma. Le consegne appariranno qui quando gli ordini saranno confermati."
        />
      )}

      {/* Today */}
      {!loadingExpected && todayDeliveries.length > 0 && (
        <section className="mb-8">
          <SectionHeader icon={Clock} title="Oggi" count={todayDeliveries.length} />
          <div className="space-y-3">
            {todayDeliveries.map((d) => (
              <DeliveryCard
                key={d.id}
                delivery={d}
                onStart={(orderId) => startMutation.mutate(orderId)}
                isStarting={startMutation.isPending}
              />
            ))}
          </div>
        </section>
      )}

      {/* This Week */}
      {!loadingExpected && weekDeliveries.length > 0 && (
        <section className="mb-8">
          <SectionHeader icon={Calendar} title="Questa Settimana" count={weekDeliveries.length} />
          <div className="space-y-3">
            {weekDeliveries.map((d) => (
              <DeliveryCard
                key={d.id}
                delivery={d}
                onStart={(orderId) => startMutation.mutate(orderId)}
                isStarting={startMutation.isPending}
              />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {!loadingExpected && upcomingDeliveries.length > 0 && (
        <section className="mb-8">
          <SectionHeader icon={ArrowRight} title="Prossimamente" count={upcomingDeliveries.length} />
          <div className="space-y-3">
            {upcomingDeliveries.map((d) => (
              <DeliveryCard
                key={d.id}
                delivery={d}
                onStart={(orderId) => startMutation.mutate(orderId)}
                isStarting={startMutation.isPending}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recent Receivings */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Ricezioni Recenti
          </h2>
        </div>
        {loadingRecent && (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} variant="rect" height={56} />
            ))}
          </div>
        )}
        {!loadingRecent && (!recents || recents.length === 0) && (
          <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            Nessuna ricezione recente
          </p>
        )}
        {!loadingRecent && recents && recents.length > 0 && (
          <div className="space-y-2">
            {recents.map((r) => (
              <RecentCard key={r.id} receiving={r} />
            ))}
          </div>
        )}
      </section>
    </motion.div>
  );
}

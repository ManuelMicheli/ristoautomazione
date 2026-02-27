import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Copy,
  FileText,
  Building2,
  Package,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatCurrency } from '@/utils/format-currency';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  useToast,
} from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OrderTemplate {
  id: string;
  name: string;
  supplierName: string;
  supplierId: string;
  itemCount: number;
  estimatedTotal: number;
  lastUsed: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function OrderTemplatesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery<OrderTemplate[]>({
    queryKey: ['order-templates'],
    queryFn: async () => {
      const res = await apiClient.get<OrderTemplate[]>('/orders/templates');
      return res.data;
    },
  });

  const cloneMutation = useMutation({
    mutationFn: (templateId: string) =>
      apiClient.post<{ id: string }>(`/orders/templates/${templateId}/clone`),
    onSuccess: (res) => {
      toast('Ordine creato dal template', 'success');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigate(`/orders/${res.data.id}`);
    },
    onError: () => toast('Errore nella creazione dell\'ordine', 'error'),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" width="40%" height={32} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton variant="rect" height={180} />
          <Skeleton variant="rect" height={180} />
          <Skeleton variant="rect" height={180} />
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
        <FileText className="h-7 w-7 text-accent-green" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Template Ordini
        </h1>
        {templates.length > 0 && (
          <Badge variant="neutral">{templates.length}</Badge>
        )}
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Utilizza i template per creare rapidamente ordini ricorrenti con prodotti e quantita preimpostati.
      </p>

      {templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nessun template disponibile"
          description="I template verranno creati automaticamente dagli ordini ricorrenti, oppure puoi salvare un ordine come template."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id}>
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {template.name}
                  </p>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Building2 className="h-4 w-4 shrink-0" />
                    <span>{template.supplierName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Package className="h-4 w-4 shrink-0" />
                    <span>{template.itemCount} prodotti</span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-700">
                  <div>
                    <p className="text-xs text-slate-400">Totale stimato</p>
                    <p className="font-medium tabular-nums text-slate-900 dark:text-white">
                      {formatCurrency(template.estimatedTotal)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    icon={<Copy className="h-4 w-4" />}
                    onClick={() => cloneMutation.mutate(template.id)}
                    loading={cloneMutation.isPending}
                  >
                    Usa Template
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}

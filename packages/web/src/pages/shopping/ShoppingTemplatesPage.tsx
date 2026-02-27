import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Modal, EmptyState, useToast } from '@/components/ui';
import { apiClient } from '@/services/api-client';
import {
  FileText,
  Play,
  Trash2,
  Clock,
  ShoppingCart,
  Plus,
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  frequency: string;
  items: Array<{ productId: string; quantity: number }>;
  createdAt: string;
}

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Settimanale',
  biweekly: 'Bisettimanale',
  monthly: 'Mensile',
  custom: 'Personalizzata',
};

export default function ShoppingTemplatesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['shopping-templates'],
    queryFn: () => apiClient.get<Template[]>('/shopping-list/templates'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.del(`/shopping-list/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-templates'] });
      setDeleteId(null);
      toast('Template eliminato');
    },
  });

  const templates = data?.data ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Template Ordini</h1>
          <p className="text-slate-400 mt-1">
            I tuoi ordini ricorrenti salvati
          </p>
        </div>
        <Button onClick={() => navigate('/spesa')}>
          <Plus className="w-4 h-4 mr-1" /> Nuova Lista
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-20 animate-pulse bg-slate-800/50">
              <div />
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nessun template"
          description="Crea una lista della spesa e salvala come template per riutilizzarla"
        />
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <Card
              key={t.id}
              className="p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-slate-800">
                  <ShoppingCart className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">{t.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />{' '}
                      {FREQ_LABELS[t.frequency] ?? t.frequency}
                    </span>
                    <span>{t.items.length} prodotti</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    navigate('/spesa', {
                      state: { templateId: t.id, items: t.items },
                    });
                  }}
                >
                  <Play className="w-3.5 h-3.5 mr-1" /> Lancia ordine
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteId(t.id)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Elimina template"
      >
        <p className="text-slate-300 mb-4">
          Sei sicuro di voler eliminare questo template?
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>
            Annulla
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            disabled={deleteMutation.isPending}
          >
            Elimina
          </Button>
        </div>
      </Modal>
    </div>
  );
}

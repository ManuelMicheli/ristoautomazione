import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Truck,
  CheckCircle,
  XCircle,
  Thermometer,
  AlertTriangle,
  FileText,
  Calendar,
  User,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatDate, formatDateTime } from '@/utils/format-date';
import { cn } from '@/utils/cn';
import { Badge, Button, Card, Skeleton } from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ReceivingLineDetail {
  id: string;
  productName: string;
  orderedQty: number;
  receivedQty: number;
  unit: string;
  isConform: boolean;
  temperature: number | null;
  nonConformity: {
    type: string;
    severity: string;
    description: string;
    photos: string[];
  } | null;
}

interface ReceivingDetail {
  id: string;
  orderId: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  receivedDate: string;
  receivedBy: string;
  status: string;
  signatureUrl: string | null;
  lines: ReceivingLineDetail[];
  notes: string | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NC_TYPE_LABEL: Record<string, string> = {
  wrong_quantity: 'Quantita Errata',
  wrong_product: 'Prodotto Sbagliato',
  temperature: 'Temperatura',
  quality: 'Qualita',
  packaging: 'Imballo',
  expired: 'Scaduto',
};

const SEVERITY_LABEL: Record<string, string> = {
  low: 'Bassa',
  medium: 'Media',
  high: 'Alta',
  critical: 'Critica',
};

const SEVERITY_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'error'> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  critical: 'error',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ReceivingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery<ReceivingDetail>({
    queryKey: ['receiving', id, 'detail'],
    queryFn: async () => {
      const res = await apiClient.get<ReceivingDetail>(`/receivings/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton variant="rect" height={80} />
        <Skeleton variant="rect" height={300} />
        <Skeleton variant="rect" height={200} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20">
        <p className="mb-4 text-sm text-red-700 dark:text-red-300">
          Errore nel caricamento del dettaglio ricezione.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Riprova
        </Button>
      </div>
    );
  }

  const nonConformLines = data.lines.filter((l) => l.nonConformity);
  const totalOrdered = data.lines.reduce((s, l) => s + l.orderedQty, 0);
  const totalReceived = data.lines.reduce((s, l) => s + l.receivedQty, 0);
  const discrepancyCount = data.lines.filter((l) => l.orderedQty !== l.receivedQty).length;

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
          onClick={() => navigate('/receiving')}
          className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna alle ricezioni
        </button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Truck className="h-7 w-7 text-accent-green" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Dettaglio Ricezione
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {data.supplierName}
              </p>
            </div>
          </div>
          <Badge variant="success" size="md">Completata</Badge>
        </div>
      </div>

      {/* Info cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-slate-400" />
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Data Ricezione</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {formatDateTime(data.receivedDate)}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-slate-400" />
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Ricevuto da</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {data.receivedBy}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-slate-400" />
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Ordine</p>
              <Link
                to={`/orders/${data.orderId}`}
                className="text-sm font-semibold text-accent-green hover:underline"
              >
                #{data.orderNumber}
              </Link>
            </div>
          </div>
        </Card>
      </div>

      {/* Lines table */}
      <Card header="Articoli Ricevuti" className="mb-6">
        <div className="overflow-x-auto -mx-6 -my-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Prodotto
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Ordinato
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Ricevuto
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Conformita
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Temp.
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {data.lines.map((line) => (
                <tr key={line.id} className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                    {line.productName}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                    {line.orderedQty} {line.unit}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-3 text-right tabular-nums font-medium',
                      line.receivedQty !== line.orderedQty
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-900 dark:text-white',
                    )}
                  >
                    {line.receivedQty} {line.unit}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {line.isConform ? (
                      <CheckCircle className="mx-auto h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="mx-auto h-5 w-5 text-red-500" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                    {line.temperature !== null ? (
                      <span className="flex items-center justify-end gap-1">
                        <Thermometer className="h-3.5 w-3.5" />
                        {line.temperature}°C
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Non-conformities */}
      {nonConformLines.length > 0 && (
        <Card header={
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span>Non Conformita ({nonConformLines.length})</span>
          </div>
        } className="mb-6">
          <div className="space-y-4">
            {nonConformLines.map((line) => (
              <div
                key={line.id}
                className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-900/10"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {line.productName}
                  </p>
                  <Badge variant={SEVERITY_VARIANT[line.nonConformity!.severity] || 'neutral'}>
                    {SEVERITY_LABEL[line.nonConformity!.severity] || line.nonConformity!.severity}
                  </Badge>
                  <Badge variant="warning">
                    {NC_TYPE_LABEL[line.nonConformity!.type] || line.nonConformity!.type}
                  </Badge>
                </div>
                {line.nonConformity!.description && (
                  <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
                    {line.nonConformity!.description}
                  </p>
                )}
                {line.nonConformity!.photos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {line.nonConformity!.photos.map((photo, idx) => (
                      <a
                        key={idx}
                        href={photo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block h-16 w-16 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-600"
                      >
                        <img
                          src={photo}
                          alt={`Foto ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Discrepancy summary */}
      <Card header="Riepilogo Discrepanze">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
            <p className="text-xs text-slate-500 dark:text-slate-400">Totale Ordinato</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">
              {totalOrdered}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
            <p className="text-xs text-slate-500 dark:text-slate-400">Totale Ricevuto</p>
            <p className={cn(
              'text-xl font-bold',
              totalReceived !== totalOrdered
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-900 dark:text-white',
            )}>
              {totalReceived}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
            <p className="text-xs text-slate-500 dark:text-slate-400">Righe con Discrepanze</p>
            <p className={cn(
              'text-xl font-bold',
              discrepancyCount > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-green-600 dark:text-green-400',
            )}>
              {discrepancyCount}
            </p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

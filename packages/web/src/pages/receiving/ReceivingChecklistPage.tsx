import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Plus,
  Minus,
  Thermometer,
  AlertTriangle,
  Camera,
  X,
  Check,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { cn } from '@/utils/cn';
import { Button, Card, Select, TextArea, Badge, Modal, Skeleton, useToast } from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ReceivingLine {
  id: string;
  orderItemId: string;
  productId: string;
  productName: string;
  orderedQty: number;
  unit: string;
  receivedQty: number | null;
  isConform: boolean;
  temperature: number | null;
  nonConformity: NonConformity | null;
}

interface NonConformity {
  type: string;
  severity: string;
  description: string;
  photos: string[];
}

interface ReceivingData {
  id: string;
  orderId: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  status: string;
  lines: ReceivingLine[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NC_TYPES = [
  { value: 'wrong_quantity', label: 'Quantita Errata' },
  { value: 'wrong_product', label: 'Prodotto Sbagliato' },
  { value: 'temperature', label: 'Temperatura' },
  { value: 'quality', label: 'Qualita' },
  { value: 'packaging', label: 'Imballo' },
  { value: 'expired', label: 'Scaduto' },
];

const SEVERITY_LEVELS = [
  { value: 'low', label: 'Bassa' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Critica' },
];

const SEVERITY_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'error'> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  critical: 'error',
};

/* ------------------------------------------------------------------ */
/*  Signature Pad                                                      */
/* ------------------------------------------------------------------ */

function SignaturePad({
  onSave,
  onClear,
}: {
  onSave: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = useCallback(
    (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if ('touches' in e) {
        const touch = e.touches[0]!;
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [],
  );

  const startDraw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      isDrawing.current = true;
      lastPos.current = getPos(e);
    },
    [getPos],
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!isDrawing.current || !lastPos.current) return;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      lastPos.current = pos;
    },
    [getPos],
  );

  const endDraw = useCallback(() => {
    isDrawing.current = false;
    lastPos.current = null;
  }, []);

  const clear = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    onClear();
  }, [onClear]);

  const save = useCallback(() => {
    if (canvasRef.current) {
      onSave(canvasRef.current.toDataURL('image/png'));
    }
  }, [onSave]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = 400;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
        Firma per conferma ricezione
      </p>
      <div className="rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair touch-none"
          style={{ height: 200 }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={clear}>
          Cancella
        </Button>
        <Button variant="primary" size="sm" onClick={save}>
          Conferma Firma
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Receiving Line Card                                                */
/* ------------------------------------------------------------------ */

function ReceivingLineCard({
  line,
  onUpdate,
}: {
  line: ReceivingLine;
  onUpdate: (updates: Partial<ReceivingLine>) => void;
}) {
  const [showNC, setShowNC] = useState(!!line.nonConformity);
  const [ncType, setNcType] = useState(line.nonConformity?.type || '');
  const [ncSeverity, setNcSeverity] = useState(line.nonConformity?.severity || '');
  const [ncDesc, setNcDesc] = useState(line.nonConformity?.description || '');
  const [photos, setPhotos] = useState<string[]>(line.nonConformity?.photos || []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isFilled = line.receivedQty !== null && line.receivedQty >= 0;

  const handleQtyChange = (delta: number) => {
    const current = line.receivedQty ?? 0;
    const next = Math.max(0, current + delta);
    onUpdate({ receivedQty: next });
  };

  const handleQtyInput = (val: string) => {
    const num = val === '' ? null : parseFloat(val);
    onUpdate({ receivedQty: num !== null && !isNaN(num) ? Math.max(0, num) : null });
  };

  const handleConformity = (conform: boolean) => {
    onUpdate({ isConform: conform });
    if (!conform && !showNC) {
      setShowNC(true);
    }
  };

  const handleTemp = (val: string) => {
    const num = val === '' ? null : parseFloat(val);
    onUpdate({ temperature: num });
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      const updatedPhotos = [...photos, url];
      setPhotos(updatedPhotos);
      onUpdate({
        nonConformity: {
          type: ncType,
          severity: ncSeverity,
          description: ncDesc,
          photos: updatedPhotos,
        },
      });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (idx: number) => {
    const updatedPhotos = photos.filter((_, i) => i !== idx);
    setPhotos(updatedPhotos);
    onUpdate({
      nonConformity: {
        type: ncType,
        severity: ncSeverity,
        description: ncDesc,
        photos: updatedPhotos,
      },
    });
  };

  const updateNC = (field: string, value: string) => {
    const updated = {
      type: field === 'type' ? value : ncType,
      severity: field === 'severity' ? value : ncSeverity,
      description: field === 'description' ? value : ncDesc,
      photos,
    };
    if (field === 'type') setNcType(value);
    if (field === 'severity') setNcSeverity(value);
    if (field === 'description') setNcDesc(value);
    onUpdate({ nonConformity: updated });
  };

  return (
    <Card
      className={cn(
        'relative transition-all',
        isFilled && 'ring-2 ring-green-200 dark:ring-green-800',
      )}
    >
      {/* Checkmark overlay */}
      {isFilled && (
        <div className="absolute right-3 top-3">
          <Check className="h-6 w-6 text-green-500" />
        </div>
      )}

      {/* Product name */}
      <p className="text-lg font-bold text-slate-900 dark:text-white pr-8">
        {line.productName}
      </p>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Ordinato: <span className="font-semibold text-slate-700 dark:text-slate-200">{line.orderedQty} {line.unit}</span>
      </p>

      {/* Quantity received with stepper */}
      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Quantita ricevuta
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleQtyChange(-1)}
            className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <Minus className="h-5 w-5" />
          </button>
          <input
            type="number"
            min={0}
            step="any"
            value={line.receivedQty ?? ''}
            onChange={(e) => handleQtyInput(e.target.value)}
            className="h-12 w-24 rounded-lg border border-slate-300 bg-white px-3 text-center text-lg font-semibold text-slate-900 focus:border-accent-green focus:outline-none focus:ring-2 focus:ring-accent-green dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            placeholder="0"
          />
          <button
            type="button"
            onClick={() => handleQtyChange(1)}
            className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <Plus className="h-5 w-5" />
          </button>
          <span className="text-sm text-slate-500 dark:text-slate-400">{line.unit}</span>
        </div>
      </div>

      {/* Conformity toggles */}
      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Conformita
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleConformity(true)}
            className={cn(
              'flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-semibold transition-all',
              line.isConform
                ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                : 'border-slate-200 bg-white text-slate-500 hover:border-green-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400',
            )}
          >
            <CheckCircle className="h-5 w-5" />
            Conforme
          </button>
          <button
            type="button"
            onClick={() => handleConformity(false)}
            className={cn(
              'flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-semibold transition-all',
              !line.isConform
                ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                : 'border-slate-200 bg-white text-slate-500 hover:border-red-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400',
            )}
          >
            <XCircle className="h-5 w-5" />
            Non Conforme
          </button>
        </div>
      </div>

      {/* Temperature */}
      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Temperatura
        </label>
        <div className="flex items-center gap-2">
          <Thermometer className="h-5 w-5 text-slate-400" />
          <input
            type="number"
            step="0.1"
            value={line.temperature ?? ''}
            onChange={(e) => handleTemp(e.target.value)}
            className="h-10 w-24 rounded-lg border border-slate-300 bg-white px-3 text-center text-sm text-slate-900 focus:border-accent-green focus:outline-none focus:ring-2 focus:ring-accent-green dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            placeholder="--"
          />
          <span className="text-sm text-slate-500 dark:text-slate-400">°C</span>
        </div>
      </div>

      {/* Report Problem button */}
      {!showNC && (
        <Button
          variant="outline"
          size="md"
          icon={<AlertTriangle className="h-4 w-4" />}
          onClick={() => setShowNC(true)}
          className="min-h-[48px] border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
        >
          Segnala Problema
        </Button>
      )}

      {/* Non-conformity form */}
      <AnimatePresence>
        {showNC && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-900/10"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Segnalazione Non Conformita
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowNC(false);
                  onUpdate({ nonConformity: null, isConform: true });
                  setNcType('');
                  setNcSeverity('');
                  setNcDesc('');
                  setPhotos([]);
                }}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <Select
                label="Tipo problema"
                options={NC_TYPES}
                value={ncType}
                onChange={(v) => updateNC('type', v as string)}
                placeholder="Seleziona tipo..."
              />
              <Select
                label="Gravita"
                options={SEVERITY_LEVELS}
                value={ncSeverity}
                onChange={(v) => updateNC('severity', v as string)}
                placeholder="Seleziona gravita..."
              />
              <TextArea
                label="Descrizione"
                value={ncDesc}
                onChange={(e) => updateNC('description', e.target.value)}
                placeholder="Descrivi il problema..."
                rows={2}
              />

              {/* Photo capture */}
              <div>
                <Button
                  variant="outline"
                  size="md"
                  icon={<Camera className="h-4 w-4" />}
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[48px]"
                >
                  Scatta Foto
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhoto}
                  className="hidden"
                />
              </div>

              {/* Photo thumbnails */}
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {photos.map((photo, idx) => (
                    <div key={idx} className="relative h-16 w-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
                      <img src={photo} alt={`Foto ${idx + 1}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ReceivingChecklistPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [lines, setLines] = useState<ReceivingLine[]>([]);
  const [showComplete, setShowComplete] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);

  /* --- Fetch receiving data --- */
  const { data, isLoading, isError, refetch } = useQuery<ReceivingData>({
    queryKey: ['receiving', id],
    queryFn: async () => {
      const res = await apiClient.get<ReceivingData>(`/receivings/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  /* --- Initialize lines from data --- */
  useEffect(() => {
    if (data?.lines && lines.length === 0) {
      setLines(
        data.lines.map((l) => ({
          ...l,
          receivedQty: l.receivedQty,
          isConform: l.isConform ?? true,
          temperature: l.temperature,
          nonConformity: l.nonConformity ?? null,
        })),
      );
    }
  }, [data, lines.length]);

  /* --- Update line --- */
  const updateLine = useCallback((lineId: string, updates: Partial<ReceivingLine>) => {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, ...updates } : l)),
    );
  }, []);

  /* --- Save progress mutation --- */
  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiClient.put(`/receivings/${id}`, { lines });
    },
  });

  /* --- Complete mutation --- */
  const completeMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post(`/receivings/${id}/complete`, {
        lines,
        signature,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivings'] });
      queryClient.invalidateQueries({ queryKey: ['receiving', id] });
      toast('Ricezione completata con successo!', 'success');
      navigate('/receiving');
    },
    onError: () => {
      toast('Errore nel completamento della ricezione. Riprova.', 'error');
    },
  });

  /* --- Progress --- */
  const verified = lines.filter((l) => l.receivedQty !== null && l.receivedQty >= 0).length;
  const total = lines.length;
  const allFilled = total > 0 && verified === total;
  const progressPct = total > 0 ? (verified / total) * 100 : 0;

  /* --- Loading --- */
  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton variant="rect" height={60} />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} variant="rect" height={200} />
        ))}
      </div>
    );
  }

  /* --- Error --- */
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20">
        <p className="mb-4 text-sm text-red-700 dark:text-red-300">
          Errore nel caricamento della ricezione.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Riprova
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col pb-20">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/receiving')}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <p className="text-base font-bold text-slate-900 dark:text-white">
              {data.supplierName}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Ordine #{data.orderNumber} &middot; {verified} di {total} verificati
            </p>
          </div>
        </div>
      </div>

      {/* Lines list */}
      <div className="flex-1 space-y-4 p-4">
        {lines.map((line) => (
          <ReceivingLineCard
            key={line.id}
            line={line}
            onUpdate={(updates) => updateLine(line.id, updates)}
          />
        ))}
      </div>

      {/* Bottom sticky bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto flex h-10 max-w-4xl items-center gap-4">
          {/* Progress bar */}
          <div className="flex-1">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <motion.div
                className="h-full rounded-full bg-accent-green"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
          <span className="whitespace-nowrap text-sm font-medium text-slate-600 dark:text-slate-400">
            {verified}/{total} verificati
          </span>
          <Button
            variant="primary"
            size="lg"
            disabled={!allFilled}
            onClick={() => setShowComplete(true)}
            className="min-h-[48px] min-w-[180px]"
          >
            Completa Ricezione
          </Button>
        </div>
      </div>

      {/* Completion Modal with signature */}
      <Modal
        isOpen={showComplete}
        onClose={() => setShowComplete(false)}
        title="Completa Ricezione"
        size="lg"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowComplete(false)}>
              Annulla
            </Button>
            <Button
              variant="primary"
              loading={completeMutation.isPending}
              disabled={!signature}
              onClick={() => completeMutation.mutate()}
            >
              Conferma e Completa
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-white">{data.supplierName}</span>
              {' '}&middot; Ordine #{data.orderNumber}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {verified} di {total} articoli verificati
            </p>
            {lines.some((l) => l.nonConformity) && (
              <div className="mt-2">
                <Badge variant="warning">
                  {lines.filter((l) => l.nonConformity).length} non conformita segnalate
                </Badge>
              </div>
            )}
          </div>

          <SignaturePad
            onSave={(dataUrl) => setSignature(dataUrl)}
            onClear={() => setSignature(null)}
          />

          {signature && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              Firma acquisita
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

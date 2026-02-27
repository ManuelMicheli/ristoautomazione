import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Upload,
  FileText,
  CheckCircle,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { Button, Card, FileUpload, Badge, useToast } from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UploadedFile {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  invoiceId?: string;
  errorMessage?: string;
  progress: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function InvoiceUploadPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [uploads, setUploads] = useState<UploadedFile[]>([]);

  /* --- Upload mutation (per file) --- */
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.upload<{ id: string }>('/invoices/upload', formData);
      return res.data;
    },
  });

  /* --- Handle files selected --- */
  const handleFiles = useCallback(
    (files: File[]) => {
      const newUploads: UploadedFile[] = files.map((file) => ({
        file,
        status: 'pending' as const,
        progress: 0,
      }));
      setUploads((prev) => [...prev, ...newUploads]);

      // Start uploading each file
      newUploads.forEach((upload, idx) => {
        const globalIdx = uploads.length + idx;

        setUploads((prev) =>
          prev.map((u, i) =>
            i === globalIdx ? { ...u, status: 'uploading', progress: 30 } : u,
          ),
        );

        const formData = new FormData();
        formData.append('file', upload.file);

        apiClient
          .upload<{ id: string }>('/invoices/upload', formData)
          .then((res) => {
            setUploads((prev) =>
              prev.map((u, i) =>
                i === globalIdx
                  ? { ...u, status: 'done', invoiceId: res.data.id, progress: 100 }
                  : u,
              ),
            );
          })
          .catch((err) => {
            setUploads((prev) =>
              prev.map((u, i) =>
                i === globalIdx
                  ? {
                      ...u,
                      status: 'error',
                      errorMessage: err?.message || 'Errore nel caricamento',
                      progress: 0,
                    }
                  : u,
              ),
            );
          });
      });
    },
    [uploads.length],
  );

  const doneCount = uploads.filter((u) => u.status === 'done').length;
  const hasUploads = uploads.length > 0;

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
          onClick={() => navigate('/invoices')}
          className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna alle fatture
        </button>
        <div className="flex items-center gap-3">
          <Upload className="h-7 w-7 text-accent-green" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Carica Fattura
          </h1>
        </div>
      </div>

      {/* Upload zone */}
      <div className="mx-auto max-w-2xl">
        <FileUpload
          accept=".pdf,.jpg,.jpeg,.png"
          multiple
          onFiles={handleFiles}
          maxSize={20 * 1024 * 1024}
          className="mb-6"
        >
          <div className="py-8">
            <Upload className="mx-auto mb-4 h-12 w-12 text-slate-400" />
            <p className="text-base font-medium text-slate-700 dark:text-slate-300">
              Trascina i file qui o{' '}
              <span className="text-accent-green">sfoglia</span>
            </p>
            <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
              PDF, JPG, PNG - Max 20MB per file
            </p>
          </div>
        </FileUpload>

        {/* File status cards */}
        {hasUploads && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              File caricati ({doneCount}/{uploads.length})
            </h2>
            {uploads.map((upload, idx) => (
              <Card key={`${upload.file.name}-${idx}`}>
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {upload.file.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {(upload.file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                    {/* Progress bar */}
                    {upload.status === 'uploading' && (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <motion.div
                          className="h-full rounded-full bg-accent-green"
                          initial={{ width: 0 }}
                          animate={{ width: `${upload.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {upload.status === 'pending' && (
                      <Badge variant="neutral">In attesa</Badge>
                    )}
                    {upload.status === 'uploading' && (
                      <Loader2 className="h-5 w-5 animate-spin text-accent-green" />
                    )}
                    {upload.status === 'done' && (
                      <div className="flex items-center gap-2">
                        <Badge variant="success">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Pronto per revisione
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<ExternalLink className="h-3.5 w-3.5" />}
                          onClick={() =>
                            navigate(`/invoices/${upload.invoiceId}`)
                          }
                        >
                          Rivedi
                        </Button>
                      </div>
                    )}
                    {upload.status === 'error' && (
                      <Badge variant="error">
                        <AlertCircle className="mr-1 h-3 w-3" />
                        Errore
                      </Badge>
                    )}
                  </div>
                </div>
                {upload.status === 'error' && upload.errorMessage && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                    {upload.errorMessage}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

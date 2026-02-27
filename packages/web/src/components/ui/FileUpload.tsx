import { useState, useRef, useCallback, type DragEvent, type ReactNode } from 'react';
import { Upload, X, FileText } from 'lucide-react';
import { cn } from '@/utils/cn';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export interface FileUploadProps {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  maxSize?: number; // bytes
  children?: ReactNode;
  className?: string;
}

export function FileUpload({
  accept,
  multiple = false,
  onFiles,
  maxSize,
  children,
  className,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndAddFiles = useCallback(
    (newFiles: File[]) => {
      setError(null);
      const validFiles: File[] = [];

      for (const file of newFiles) {
        if (maxSize && file.size > maxSize) {
          setError(`Il file "${file.name}" supera la dimensione massima di ${formatFileSize(maxSize)}`);
          continue;
        }
        validFiles.push(file);
      }

      if (validFiles.length > 0) {
        const updated = multiple ? [...files, ...validFiles] : validFiles;
        setFiles(updated);
        onFiles(updated);
      }
    },
    [files, maxSize, multiple, onFiles]
  );

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    validateAndAddFiles(droppedFiles);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      validateAndAddFiles(Array.from(e.target.files));
    }
    // Reset input so same file can be selected again
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    onFiles(updated);
  };

  return (
    <div className={cn('w-full', className)}>
      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          isDragging
            ? 'border-accent-green bg-accent-green/5'
            : 'border-slate-300 hover:border-slate-400 dark:border-slate-600 dark:hover:border-slate-500',
          'bg-slate-50 dark:bg-slate-800/50'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          className="hidden"
        />
        {children || (
          <>
            <Upload
              className={cn(
                'mb-3 h-8 w-8',
                isDragging ? 'text-accent-green' : 'text-slate-400'
              )}
            />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Trascina i file qui o{' '}
              <span className="text-accent-green">sfoglia</span>
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {accept ? `Formati: ${accept}` : 'Tutti i formati'}
              {maxSize && ` - Max ${formatFileSize(maxSize)}`}
            </p>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="mt-2 text-xs text-accent-red">{error}</p>
      )}

      {/* File list */}
      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            >
              <FileText className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                  {file.name}
                </p>
                <p className="text-xs text-slate-400">
                  {formatFileSize(file.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(index);
                }}
                className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

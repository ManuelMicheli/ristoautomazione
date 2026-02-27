import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/utils/cn';

export interface TextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  maxLength?: number;
  autoResize?: boolean;
}

const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  (
    {
      label,
      error,
      maxLength,
      autoResize = false,
      rows = 3,
      className,
      id,
      value,
      onChange,
      ...props
    },
    ref
  ) => {
    const internalRef = useRef<HTMLTextAreaElement | null>(null);
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');

    const setRefs = useCallback(
      (node: HTMLTextAreaElement | null) => {
        internalRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );

    const adjustHeight = useCallback(() => {
      const textarea = internalRef.current;
      if (textarea && autoResize) {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
      }
    }, [autoResize]);

    useEffect(() => {
      adjustHeight();
    }, [value, adjustHeight]);

    const charCount = typeof value === 'string' ? value.length : 0;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            {label}
          </label>
        )}
        <textarea
          ref={setRefs}
          id={textareaId}
          rows={rows}
          value={value}
          maxLength={maxLength}
          onChange={(e) => {
            onChange?.(e);
            adjustHeight();
          }}
          className={cn(
            'w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-accent-green focus:border-accent-green',
            'dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500',
            error
              ? 'border-accent-red focus:ring-accent-red focus:border-accent-red'
              : 'border-slate-300 dark:border-slate-600',
            autoResize && 'resize-none overflow-hidden',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          aria-invalid={error ? 'true' : undefined}
          {...props}
        />
        <div className="mt-1 flex items-center justify-between">
          {error ? (
            <p className="text-xs text-accent-red">{error}</p>
          ) : (
            <span />
          )}
          {maxLength !== undefined && (
            <p
              className={cn(
                'text-xs',
                charCount >= maxLength
                  ? 'text-accent-red'
                  : 'text-slate-400 dark:text-slate-500'
              )}
            >
              {charCount}/{maxLength}
            </p>
          )}
        </div>
      </div>
    );
  }
);

TextArea.displayName = 'TextArea';
export { TextArea };

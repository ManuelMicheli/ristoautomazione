import { useEffect, useRef, type ChangeEvent } from 'react';
import { cn } from '@/utils/cn';

export interface CheckboxProps {
  label?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  indeterminate?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function Checkbox({
  label,
  checked = false,
  onChange,
  indeterminate = false,
  disabled = false,
  className,
  id,
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const checkboxId = id || label?.toLowerCase().replace(/\s+/g, '-');

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.checked);
  };

  return (
    <label
      htmlFor={checkboxId}
      className={cn(
        'inline-flex items-center gap-2.5 select-none',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className
      )}
    >
      <div className="relative flex items-center justify-center">
        <input
          ref={inputRef}
          id={checkboxId}
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          className="peer sr-only"
        />
        <div
          className={cn(
            'h-5 w-5 rounded border-2 transition-colors',
            'flex items-center justify-center',
            checked || indeterminate
              ? 'border-accent-green bg-accent-green'
              : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800',
            !disabled && !checked && !indeterminate && 'hover:border-accent-green'
          )}
        >
          {checked && !indeterminate && (
            <svg
              className="h-3 w-3 text-white"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 6l3 3 5-5" />
            </svg>
          )}
          {indeterminate && (
            <svg
              className="h-3 w-3 text-white"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M2 6h8" />
            </svg>
          )}
        </div>
      </div>
      {label && (
        <span className="text-sm text-slate-700 dark:text-slate-300">
          {label}
        </span>
      )}
    </label>
  );
}

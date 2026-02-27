import { useState, useRef, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, eachDayOfInterval, isSameMonth, isSameDay, isAfter, isBefore } from 'date-fns';
import { it } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

const dayLabels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export interface DatePickerProps {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  error?: string;
  label?: string;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Seleziona data...',
  minDate,
  maxDate,
  error,
  label,
  className,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => value || new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Sync viewDate when value changes
  useEffect(() => {
    if (value) setViewDate(value);
  }, [value]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(viewDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [viewDate]);

  const isDisabled = (day: Date) => {
    if (minDate && isBefore(day, startOfMonth(minDate)) && isBefore(day, minDate)) return true;
    if (minDate && isBefore(day, minDate)) return true;
    if (maxDate && isAfter(day, maxDate)) return true;
    return false;
  };

  const handleSelect = (day: Date) => {
    if (isDisabled(day)) return;
    onChange?.(day);
    setIsOpen(false);
  };

  const displayValue = value ? format(value, 'dd/MM/yyyy', { locale: it }) : '';
  const monthYearLabel = format(viewDate, 'MMMM yyyy', { locale: it });

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
      )}

      {/* Input trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex h-10 w-full items-center rounded-lg border bg-white px-3 text-sm transition-colors',
          'dark:bg-slate-800',
          error
            ? 'border-accent-red'
            : isOpen
              ? 'border-accent-green ring-2 ring-accent-green'
              : 'border-slate-300 dark:border-slate-600',
          'focus:outline-none focus:ring-2 focus:ring-accent-green focus:border-accent-green'
        )}
      >
        <Calendar className="mr-2 h-4 w-4 text-slate-400" />
        <span
          className={cn(
            'flex-1 text-left',
            displayValue
              ? 'text-slate-900 dark:text-slate-100'
              : 'text-slate-400 dark:text-slate-500'
          )}
        >
          {displayValue || placeholder}
        </span>
      </button>

      {/* Calendar dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {/* Month navigation */}
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewDate(subMonths(viewDate, 1))}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold capitalize text-slate-900 dark:text-white">
              {monthYearLabel}
            </span>
            <button
              type="button"
              onClick={() => setViewDate(addMonths(viewDate, 1))}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="mb-1 grid grid-cols-7 gap-0">
            {dayLabels.map((d) => (
              <div
                key={d}
                className="py-1 text-center text-xs font-medium text-slate-400 dark:text-slate-500"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0">
            {calendarDays.map((day) => {
              const inMonth = isSameMonth(day, viewDate);
              const isSelected = value ? isSameDay(day, value) : false;
              const isToday = isSameDay(day, new Date());
              const disabled = isDisabled(day);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelect(day)}
                  className={cn(
                    'flex h-8 w-8 mx-auto items-center justify-center rounded-md text-sm transition-colors',
                    !inMonth && 'text-slate-300 dark:text-slate-600',
                    inMonth && !isSelected && !disabled && 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
                    isSelected && 'bg-accent-green text-white font-medium',
                    isToday && !isSelected && 'font-bold ring-1 ring-accent-green',
                    disabled && 'cursor-not-allowed opacity-30'
                  )}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {/* Today button */}
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              setViewDate(today);
              handleSelect(today);
            }}
            className="mt-2 w-full rounded-md py-1.5 text-xs font-medium text-accent-green hover:bg-accent-green/10 transition-colors"
          >
            Oggi
          </button>
        </div>
      )}

      {error && (
        <p className="mt-1 text-xs text-accent-red">{error}</p>
      )}
    </div>
  );
}

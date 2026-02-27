import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { it } from 'date-fns/locale';

/**
 * Safely parse a date value from string, Date, or number.
 */
function toDate(date: string | Date | number): Date {
  if (typeof date === 'string') {
    const parsed = parseISO(date);
    return isValid(parsed) ? parsed : new Date(date);
  }
  if (typeof date === 'number') {
    return new Date(date);
  }
  return date;
}

/**
 * Format date as DD/MM/YYYY.
 * Example: formatDate('2024-03-15') => "15/03/2024"
 */
export function formatDate(date: string | Date | number): string {
  return format(toDate(date), 'dd/MM/yyyy', { locale: it });
}

/**
 * Format date as DD/MM/YYYY HH:mm.
 * Example: formatDateTime('2024-03-15T14:30:00Z') => "15/03/2024 14:30"
 */
export function formatDateTime(date: string | Date | number): string {
  return format(toDate(date), 'dd/MM/yyyy HH:mm', { locale: it });
}

/**
 * Format date as a relative time string in Italian.
 * Example: formatRelative(fiveMinutesAgo) => "5 minuti fa"
 */
export function formatRelative(date: string | Date | number): string {
  return formatDistanceToNow(toDate(date), {
    addSuffix: true,
    locale: it,
  });
}

/**
 * Format date as a short human-readable string.
 * Example: formatDateShort('2024-03-15') => "15 mar 2024"
 */
export function formatDateShort(date: string | Date | number): string {
  return format(toDate(date), 'd MMM yyyy', { locale: it });
}

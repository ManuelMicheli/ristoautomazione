import { type ReactNode } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Skeleton } from './Skeleton';

export interface ColumnDef<T> {
  key: string;
  header: string;
  cell?: (row: T, index: number) => ReactNode;
  sortable?: boolean;
  width?: string;
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  pagination?: PaginationProps;
  onRowClick?: (row: T, index: number) => void;
  selectable?: boolean;
  selectedRows?: Set<number>;
  onSelectRow?: (index: number) => void;
  onSelectAll?: (selected: boolean) => void;
  emptyMessage?: string;
  loading?: boolean;
  className?: string;
}

function SortIcon({ active, direction }: { active: boolean; direction?: 'asc' | 'desc' }) {
  return (
    <span className="ml-1 inline-flex flex-col">
      <ChevronUp
        className={cn(
          'h-3 w-3 -mb-1',
          active && direction === 'asc' ? 'text-accent-green' : 'text-slate-300 dark:text-slate-600'
        )}
      />
      <ChevronDown
        className={cn(
          'h-3 w-3',
          active && direction === 'desc' ? 'text-accent-green' : 'text-slate-300 dark:text-slate-600'
        )}
      />
    </span>
  );
}

function PaginationBar({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  if (totalPages <= 1) return null;

  // Generate page numbers to show
  const pages: (number | 'ellipsis')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis');
    }
  }

  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-700">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {start}-{end} di {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed dark:text-slate-400 dark:hover:bg-slate-700"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-slate-400">
              ...
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors',
                p === page
                  ? 'bg-accent-green text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
              )}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed dark:text-slate-400 dark:hover:bg-slate-700"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function DataTable<T extends object>({
  columns,
  data,
  onSort,
  sortKey,
  sortDirection,
  pagination,
  onRowClick,
  selectable,
  selectedRows,
  onSelectRow,
  onSelectAll,
  emptyMessage = 'Nessun dato disponibile',
  loading = false,
  className,
}: DataTableProps<T>) {
  const handleSort = (key: string) => {
    if (!onSort) return;
    const newDirection = sortKey === key && sortDirection === 'asc' ? 'desc' : 'asc';
    onSort(key, newDirection);
  };

  const allSelected = data.length > 0 && selectedRows?.size === data.length;

  return (
    <div className={cn('overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => onSelectAll?.(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-accent-green focus:ring-accent-green dark:border-slate-600"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400',
                    col.sortable && 'cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200'
                  )}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="inline-flex items-center">
                    {col.header}
                    {col.sortable && (
                      <SortIcon
                        active={sortKey === col.key}
                        direction={sortKey === col.key ? sortDirection : undefined}
                      />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={`skeleton-${i}`}>
                  {selectable && (
                    <td className="px-4 py-3">
                      <Skeleton variant="rect" width={16} height={16} />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <Skeleton variant="text" width="75%" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="py-12 text-center text-slate-400 dark:text-slate-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  onClick={() => onRowClick?.(row, rowIndex)}
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50',
                    selectedRows?.has(rowIndex) && 'bg-accent-green/5'
                  )}
                >
                  {selectable && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedRows?.has(rowIndex) || false}
                        onChange={() => onSelectRow?.(rowIndex)}
                        className="h-4 w-4 rounded border-slate-300 text-accent-green focus:ring-accent-green dark:border-slate-600"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="px-4 py-3 text-slate-700 dark:text-slate-300"
                    >
                      {col.cell
                        ? col.cell(row, rowIndex)
                        : ((row as any)[col.key] as ReactNode) ?? '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pagination && !loading && data.length > 0 && (
        <PaginationBar {...pagination} />
      )}
    </div>
  );
}

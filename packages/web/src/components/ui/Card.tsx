import { type ReactNode, type HTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  hoverable?: boolean;
}

export function Card({
  header,
  footer,
  children,
  hoverable = false,
  className,
  onClick,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-white dark:bg-slate-800',
        'border-gray-200 dark:border-slate-700',
        hoverable &&
          'transition-shadow hover:shadow-lg dark:hover:shadow-slate-900/50',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
      {...props}
    >
      {header && (
        <div className="border-b border-gray-200 px-6 py-4 dark:border-slate-700">
          {typeof header === 'string' ? (
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {header}
            </h3>
          ) : (
            header
          )}
        </div>
      )}
      <div className="px-6 py-4">{children}</div>
      {footer && (
        <div className="border-t border-gray-200 px-6 py-4 dark:border-slate-700">
          {footer}
        </div>
      )}
    </div>
  );
}

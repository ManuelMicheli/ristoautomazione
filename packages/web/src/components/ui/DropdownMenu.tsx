import { useState, useRef, useEffect, type ReactNode, type KeyboardEvent } from 'react';
import { cn } from '@/utils/cn';

export interface DropdownMenuItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger';
  divider?: boolean;
}

export interface DropdownMenuProps {
  trigger: ReactNode;
  items: DropdownMenuItem[];
  align?: 'left' | 'right';
  className?: string;
}

export function DropdownMenu({
  trigger,
  items,
  align = 'right',
  className,
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const actionItems = items.filter((item) => !item.divider);

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setHighlightedIndex(0);
        } else {
          setHighlightedIndex((i) => Math.min(i + 1, actionItems.length - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0 && actionItems[highlightedIndex]) {
          actionItems[highlightedIndex].onClick?.();
          setIsOpen(false);
        } else {
          setIsOpen(true);
          setHighlightedIndex(0);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  let actionIndex = -1;

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          setIsOpen(!isOpen);
          setHighlightedIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        className="focus:outline-none"
      >
        {trigger}
      </div>

      {isOpen && (
        <div
          className={cn(
            'absolute z-50 mt-1 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg',
            'dark:border-slate-700 dark:bg-slate-800',
            align === 'right' ? 'right-0' : 'left-0'
          )}
          role="menu"
        >
          {items.map((item, index) => {
            if (item.divider) {
              return (
                <div
                  key={`divider-${index}`}
                  className="my-1 border-t border-slate-200 dark:border-slate-700"
                />
              );
            }

            actionIndex++;
            const currentActionIndex = actionIndex;

            return (
              <button
                key={`${item.label}-${index}`}
                role="menuitem"
                type="button"
                onClick={() => {
                  item.onClick?.();
                  setIsOpen(false);
                }}
                onMouseEnter={() => setHighlightedIndex(currentActionIndex)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                  currentActionIndex === highlightedIndex &&
                    'bg-slate-100 dark:bg-slate-700',
                  item.variant === 'danger'
                    ? 'text-accent-red hover:bg-red-50 dark:hover:bg-red-900/20'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                )}
              >
                {item.icon && (
                  <span className="h-4 w-4 shrink-0">{item.icon}</span>
                )}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

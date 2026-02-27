import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface StatCardProps {
  icon: LucideIcon;
  value: number;
  label: string;
  trend?: {
    value: number;
    direction: 'up' | 'down';
  };
  prefix?: string;
  suffix?: string;
  className?: string;
}

function useCountUp(target: number, duration: number = 1000): number {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (target === 0) {
      setCurrent(0);
      return;
    }

    const startTime = performance.now();
    let raf: number;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out curve
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * target));

      if (progress < 1) {
        raf = requestAnimationFrame(animate);
      }
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return current;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('it-IT').format(n);
}

export function StatCard({
  icon: Icon,
  value,
  label,
  trend,
  prefix = '',
  suffix = '',
  className,
}: StatCardProps) {
  const animatedValue = useCountUp(value);

  // For spending: down=good (green), up=bad (red)
  // Default convention for a procurement platform
  const trendColor = trend
    ? trend.direction === 'down'
      ? 'text-accent-green'
      : 'text-accent-red'
    : '';

  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-5 dark:bg-slate-800',
        'border-gray-200 dark:border-slate-700',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
          <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </div>
        {trend && (
          <div className={cn('flex items-center gap-1 text-sm font-medium', trendColor)}>
            {trend.direction === 'up' ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            <span>{trend.value}%</span>
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-slate-900 dark:text-white">
          {prefix}{formatNumber(animatedValue)}{suffix}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

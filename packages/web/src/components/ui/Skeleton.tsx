import { cn } from '@/utils/cn';

export interface SkeletonProps {
  variant?: 'text' | 'circle' | 'rect';
  width?: string | number;
  height?: string | number;
  className?: string;
  count?: number;
}

function SkeletonItem({
  variant = 'text',
  width,
  height,
  className,
}: Omit<SkeletonProps, 'count'>) {
  const variantStyles = {
    text: 'h-4 rounded',
    circle: 'rounded-full',
    rect: 'rounded-lg',
  };

  return (
    <div
      className={cn(
        'animate-pulse bg-slate-200 dark:bg-slate-700',
        variantStyles[variant],
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...(variant === 'circle' && !width && !height
          ? { width: '40px', height: '40px' }
          : {}),
        ...(variant === 'rect' && !height ? { height: '80px' } : {}),
      }}
    />
  );
}

export function Skeleton({
  count = 1,
  ...props
}: SkeletonProps) {
  if (count <= 1) return <SkeletonItem {...props} />;

  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonItem key={i} {...props} />
      ))}
    </div>
  );
}

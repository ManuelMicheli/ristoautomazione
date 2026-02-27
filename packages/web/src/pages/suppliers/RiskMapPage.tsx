import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ShieldAlert, AlertTriangle, Users } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { cn } from '@/utils/cn';
import { Badge, Card, Skeleton, EmptyState } from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RiskMapSupplier {
  id: string;
  businessName: string;
  score: number | null;
}

interface RiskMapCategory {
  category: string;
  supplierCount: number;
  suppliers: RiskMapSupplier[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function riskLevel(count: number): 'high' | 'medium' | 'low' {
  if (count <= 1) return 'high';
  if (count === 2) return 'medium';
  return 'low';
}

const riskBorderColors: Record<string, string> = {
  high: 'border-red-400 dark:border-red-500',
  medium: 'border-amber-400 dark:border-amber-500',
  low: 'border-green-400 dark:border-green-500',
};

const riskBgGlow: Record<string, string> = {
  high: 'shadow-red-100 dark:shadow-red-900/20',
  medium: 'shadow-amber-100 dark:shadow-amber-900/20',
  low: '',
};

function miniScoreBadge(score: number | null) {
  if (score === null || score === undefined) {
    return <Badge variant="neutral" size="sm">N/D</Badge>;
  }
  if (score > 80) return <Badge variant="success" size="sm">{score}</Badge>;
  if (score >= 50) return <Badge variant="warning" size="sm">{score}</Badge>;
  return <Badge variant="error" size="sm">{score}</Badge>;
}

/* ------------------------------------------------------------------ */
/*  Category Card                                                      */
/* ------------------------------------------------------------------ */

function CategoryRiskCard({ item }: { item: RiskMapCategory }) {
  const risk = riskLevel(item.supplierCount);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={cn(
          'border-2 transition-shadow',
          riskBorderColors[risk],
          risk !== 'low' && `shadow-lg ${riskBgGlow[risk]}`
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {item.category}
            </h3>
            {risk === 'high' && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Fornitore unico &mdash; rischio elevato
              </div>
            )}
            {risk === 'medium' && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Solo 2 fornitori &mdash; rischio moderato
              </div>
            )}
          </div>
          <div className="flex flex-col items-center">
            <span
              className={cn(
                'text-3xl font-bold tabular-nums',
                risk === 'high'
                  ? 'text-red-600 dark:text-red-400'
                  : risk === 'medium'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-green-600 dark:text-green-400'
              )}
            >
              {item.supplierCount}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {item.supplierCount === 1 ? 'fornitore' : 'fornitori'}
            </span>
          </div>
        </div>

        {/* Suppliers list */}
        <div className="mt-4 space-y-2">
          {item.suppliers.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-700/50"
            >
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {s.businessName}
              </span>
              {miniScoreBadge(s.score)}
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function RiskMapPage() {
  const { data: categories = [], isLoading } = useQuery<RiskMapCategory[]>({
    queryKey: ['suppliers', 'risk-map'],
    queryFn: async () => {
      const res = await apiClient.get<RiskMapCategory[]>('/suppliers/risk-map');
      return res.data;
    },
  });

  // Sort by risk: high risk first
  const sorted = [...categories].sort(
    (a, b) => a.supplierCount - b.supplierCount
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-7 w-7 text-accent-green" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Mappa dei Rischi Fornitura
        </h1>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <span className="text-xs text-slate-600 dark:text-slate-400">
            Rischio elevato (1 fornitore)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="text-xs text-slate-600 dark:text-slate-400">
            Rischio moderato (2 fornitori)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-green-400" />
          <span className="text-xs text-slate-600 dark:text-slate-400">
            Basso rischio (3+ fornitori)
          </span>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} variant="rect" height={200} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nessun dato disponibile"
          description="La mappa dei rischi apparira quando ci saranno fornitori con categorie assegnate."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((cat) => (
            <CategoryRiskCard key={cat.category} item={cat} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

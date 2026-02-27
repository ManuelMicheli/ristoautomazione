import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import {
  Clock,
  CheckCircle,
  TrendingUp,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { formatCurrency } from '@/utils/format-currency';
import { cn } from '@/utils/cn';
import { Badge, Card, Skeleton, StatCard } from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PriceDetail {
  productName: string;
  supplierPrice: number;
  averagePrice: number;
  deviationPercent: number;
}

interface SupplierScore {
  compositeScore: number | null;
  punctuality: {
    score: number | null;
    onTimeDeliveries: number;
    totalDeliveries: number;
  };
  conformity: {
    score: number | null;
    conformItems: number;
    totalItems: number;
  };
  priceCompetitiveness: {
    score: number | null;
    avgDeviationPercent: number;
    details: PriceDetail[];
  };
  reliability: {
    score: number | null;
    completedOrders: number;
    totalOrders: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Score Gauge (SVG circle)                                           */
/* ------------------------------------------------------------------ */

function ScoreGauge({ score }: { score: number | null }) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const displayScore = score ?? 0;
  const offset = circumference - (displayScore / 100) * circumference;

  const color =
    score === null
      ? '#94a3b8'
      : score > 80
        ? '#22c55e'
        : score >= 50
          ? '#f59e0b'
          : '#ef4444';

  return (
    <div className="flex flex-col items-center">
      <svg width="180" height="180" viewBox="0 0 180 180">
        {/* Background circle */}
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          className="text-slate-200 dark:text-slate-700"
        />
        {/* Score arc */}
        <motion.circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
          transform="rotate(-90 90 90)"
        />
        {/* Score text */}
        <text
          x="90"
          y="82"
          textAnchor="middle"
          className="fill-slate-900 dark:fill-white"
          fontSize="36"
          fontWeight="bold"
        >
          {score !== null ? score : 'N/D'}
        </text>
        <text
          x="90"
          y="108"
          textAnchor="middle"
          className="fill-slate-400 dark:fill-slate-500"
          fontSize="12"
        >
          su 100
        </text>
      </svg>
      <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-400">
        Score Complessivo
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dimension card (used for null/insufficient data)                   */
/* ------------------------------------------------------------------ */

function DimensionCard({
  icon: Icon,
  label,
  score,
  detail,
}: {
  icon: typeof Clock;
  label: string;
  score: number | null;
  detail: string;
}) {
  if (score === null) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
            <Icon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
          </div>
        </div>
        <div className="mt-3">
          <p className="text-lg font-bold text-slate-400 dark:text-slate-500">
            Dati insufficienti
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label}</p>
        </div>
      </div>
    );
  }

  return (
    <StatCard icon={Icon} value={score} label={label} suffix={` — ${detail}`} />
  );
}

/* ------------------------------------------------------------------ */
/*  Price Detail Table                                                 */
/* ------------------------------------------------------------------ */

function PriceDetailSection({ details }: { details: PriceDetail[] }) {
  const [expanded, setExpanded] = useState(false);

  if (details.length === 0) return null;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
            Dettaglio Competitivita Prezzo
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {details.length} prodotti confrontati
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-slate-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-slate-400" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Prodotto
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Prezzo Fornitore
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Prezzo Medio
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Deviazione
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {details.map((d, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-900 dark:text-white">
                        {d.productName}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {formatCurrency(d.supplierPrice)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {formatCurrency(d.averagePrice)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                            d.deviationPercent <= 0
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          )}
                        >
                          {d.deviationPercent > 0 ? '+' : ''}
                          {d.deviationPercent.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Scorecard Component                                           */
/* ------------------------------------------------------------------ */

export default function SupplierScorecard({ supplierId }: { supplierId: string }) {
  const { data: score, isLoading } = useQuery<SupplierScore>({
    queryKey: ['supplier', supplierId, 'score'],
    queryFn: async () => {
      const res = await apiClient.get<SupplierScore>(`/suppliers/${supplierId}/score`);
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-center">
          <Skeleton variant="circle" width={180} height={180} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton variant="rect" height={100} />
          <Skeleton variant="rect" height={100} />
          <Skeleton variant="rect" height={100} />
          <Skeleton variant="rect" height={100} />
        </div>
        <Skeleton variant="rect" height={250} />
      </div>
    );
  }

  if (!score) {
    return (
      <Card>
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Nessun dato di performance disponibile per questo fornitore.
        </p>
      </Card>
    );
  }

  const radarData = [
    {
      dimension: 'Puntualita',
      value: score.punctuality.score ?? 0,
      fullMark: 100,
    },
    {
      dimension: 'Conformita',
      value: score.conformity.score ?? 0,
      fullMark: 100,
    },
    {
      dimension: 'Prezzo',
      value: score.priceCompetitiveness.score ?? 0,
      fullMark: 100,
    },
    {
      dimension: 'Affidabilita',
      value: score.reliability.score ?? 0,
      fullMark: 100,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Composite Score Gauge */}
      <div className="flex justify-center">
        <ScoreGauge score={score.compositeScore} />
      </div>

      {/* Dimension StatCards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DimensionCard
          icon={Clock}
          label="Puntualita"
          score={score.punctuality.score}
          detail={`${score.punctuality.onTimeDeliveries}/${score.punctuality.totalDeliveries} consegne puntuali`}
        />
        <DimensionCard
          icon={CheckCircle}
          label="Conformita"
          score={score.conformity.score}
          detail={`${score.conformity.conformItems}/${score.conformity.totalItems} righe conformi`}
        />
        <DimensionCard
          icon={TrendingUp}
          label="Competitivita Prezzo"
          score={score.priceCompetitiveness.score}
          detail={`deviazione media: ${score.priceCompetitiveness.avgDeviationPercent > 0 ? '+' : ''}${score.priceCompetitiveness.avgDeviationPercent.toFixed(1)}%`}
        />
        <DimensionCard
          icon={ShieldCheck}
          label="Affidabilita"
          score={score.reliability.score}
          detail={`${score.reliability.completedOrders}/${score.reliability.totalOrders} ordini completati`}
        />
      </div>

      {/* Radar Chart */}
      <Card header="Profilo Fornitore">
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
              <PolarGrid
                stroke="#e2e8f0"
                className="dark:stroke-slate-700"
              />
              <PolarAngleAxis
                dataKey="dimension"
                tick={{
                  fill: '#64748b',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                tickCount={5}
              />
              <Radar
                name="Score"
                dataKey="value"
                stroke="#22c55e"
                fill="#22c55e"
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Price Details Table */}
      <PriceDetailSection details={score.priceCompetitiveness.details} />
    </motion.div>
  );
}

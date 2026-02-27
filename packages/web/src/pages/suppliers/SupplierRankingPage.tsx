import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Trophy, Medal } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { cn } from '@/utils/cn';
import {
  Badge,
  Card,
  Select,
  Skeleton,
  Tabs,
  EmptyState,
  type TabItem,
} from '@/components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RankedSupplier {
  id: string;
  businessName: string;
  category: string;
  compositeScore: number | null;
  punctualityScore: number | null;
  conformityScore: number | null;
  priceScore: number | null;
  reliabilityScore: number | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SORT_TABS: TabItem[] = [
  { value: 'composite', label: 'Complessivo' },
  { value: 'punctuality', label: 'Puntualita' },
  { value: 'conformity', label: 'Conformita' },
  { value: 'price', label: 'Prezzo' },
  { value: 'reliability', label: 'Affidabilita' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'Tutte le categorie' },
  { value: 'Ortofrutta', label: 'Ortofrutta' },
  { value: 'Ittico', label: 'Ittico' },
  { value: 'Carni', label: 'Carni' },
  { value: 'Latticini', label: 'Latticini' },
  { value: 'Beverage', label: 'Beverage' },
  { value: 'Secco', label: 'Secco' },
  { value: 'Non Food', label: 'Non Food' },
  { value: 'Altro', label: 'Altro' },
];

const PODIUM_BORDERS: Record<number, string> = {
  0: 'border-l-4 border-l-yellow-400',
  1: 'border-l-4 border-l-slate-400',
  2: 'border-l-4 border-l-amber-600',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function scoreBadge(score: number | null) {
  if (score === null || score === undefined) {
    return <Badge variant="neutral">N/D</Badge>;
  }
  if (score > 80) return <Badge variant="success">{score}</Badge>;
  if (score >= 50) return <Badge variant="warning">{score}</Badge>;
  return <Badge variant="error">{score}</Badge>;
}

function scoreText(score: number | null) {
  if (score === null || score === undefined) {
    return <span className="text-slate-400 dark:text-slate-500">N/D</span>;
  }
  return (
    <span
      className={cn(
        'tabular-nums font-medium',
        score > 80
          ? 'text-green-600 dark:text-green-400'
          : score >= 50
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-red-600 dark:text-red-400'
      )}
    >
      {score}
    </span>
  );
}

function PodiumIcon({ position }: { position: number }) {
  if (position === 0) {
    return <Trophy className="h-4 w-4 text-yellow-500" />;
  }
  if (position === 1) {
    return <Medal className="h-4 w-4 text-slate-400" />;
  }
  if (position === 2) {
    return <Medal className="h-4 w-4 text-amber-600" />;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function SupplierRankingPage() {
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState('composite');

  const { data: suppliers = [], isLoading } = useQuery<RankedSupplier[]>({
    queryKey: ['suppliers', 'ranking', category, sortBy],
    queryFn: async () => {
      const res = await apiClient.get<RankedSupplier[]>('/suppliers/ranking', {
        category: category || undefined,
        sortBy,
      });
      return res.data;
    },
  });

  const columns: {
    key: string;
    header: string;
    width?: string;
    cell?: (row: RankedSupplier, index: number) => React.ReactNode;
  }[] = [
    {
      key: 'position',
      header: '#',
      width: '60px',
      cell: (_row, index) => (
        <div className="flex items-center gap-2">
          <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
            {index + 1}
          </span>
          <PodiumIcon position={index} />
        </div>
      ),
    },
    {
      key: 'businessName',
      header: 'Fornitore',
      cell: (row) => (
        <Link
          to={`/suppliers/${row.id}`}
          className="font-medium text-slate-900 hover:text-accent-green dark:text-white dark:hover:text-accent-green"
          onClick={(e) => e.stopPropagation()}
        >
          {row.businessName}
        </Link>
      ),
    },
    {
      key: 'category',
      header: 'Categoria',
      cell: (row) => <Badge variant="info">{row.category}</Badge>,
    },
    {
      key: 'compositeScore',
      header: 'Score Complessivo',
      cell: (row) => scoreBadge(row.compositeScore),
    },
    {
      key: 'punctualityScore',
      header: 'Puntualita',
      cell: (row) => scoreText(row.punctualityScore),
    },
    {
      key: 'conformityScore',
      header: 'Conformita',
      cell: (row) => scoreText(row.conformityScore),
    },
    {
      key: 'priceScore',
      header: 'Prezzo',
      cell: (row) => scoreText(row.priceScore),
    },
    {
      key: 'reliabilityScore',
      header: 'Affidabilita',
      cell: (row) => scoreText(row.reliabilityScore),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Trophy className="h-7 w-7 text-accent-green" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Classifica Fornitori
          </h1>
        </div>
        <div className="w-64">
          <Select
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(v) => setCategory(v as string)}
            placeholder="Tutte le categorie"
          />
        </div>
      </div>

      {/* Sort dimension tabs */}
      <Tabs tabs={SORT_TABS} value={sortBy} onChange={setSortBy} />

      {/* Table */}
      {isLoading ? (
        <Card>
          <Skeleton variant="rect" height={400} />
        </Card>
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Nessun fornitore classificato"
          description="I fornitori appariranno qui una volta che avranno ordini e valutazioni."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                      style={col.width ? { width: col.width } : undefined}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                {suppliers.map((supplier, index) => (
                  <tr
                    key={supplier.id}
                    className={cn(
                      'transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50',
                      PODIUM_BORDERS[index] || ''
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className="px-4 py-3 text-slate-700 dark:text-slate-300"
                      >
                        {col.cell
                          ? col.cell(supplier, index)
                          : (supplier as any)[col.key] as React.ReactNode ?? '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}

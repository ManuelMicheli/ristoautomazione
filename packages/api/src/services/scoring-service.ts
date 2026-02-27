import { eq, and, isNull, sql, gte, desc, count, asc } from 'drizzle-orm';
import {
  suppliers,
  receivings,
  receivingLines,
  nonConformities,
  purchaseOrders,
  supplierProducts,
  products,
  supplierDocuments,
} from '@cph/db';
import { subMonths } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoreDimension {
  score: number | null;
  weight: number;
  sampleSize: number;
  details?: Record<string, unknown>;
}

interface ScoreBreakdown {
  supplierId: string;
  compositeScore: number | null;
  punctuality: ScoreDimension;
  conformity: ScoreDimension;
  priceCompetitiveness: ScoreDimension;
  reliability: ScoreDimension;
  calculatedAt: string;
}

// ---------------------------------------------------------------------------
// ScoringService
// ---------------------------------------------------------------------------

export class ScoringService {
  /**
   * Calculate score for a single supplier.
   *
   * Dimensions:
   *   - Punctuality (30%): on-time deliveries vs total
   *   - Conformity (30%): conforming lines vs total lines
   *   - Price Competitiveness (25%): deviation from market avg
   *   - Reliability (15%): completed order flow vs total sent
   *
   * If a dimension has no data, its weight is redistributed proportionally
   * across dimensions that do have data.
   */
  static async calculateScore(
    db: any,
    supplierId: string,
    tenantId: string,
  ): Promise<ScoreBreakdown> {
    const sixMonthsAgo = subMonths(new Date(), 6);

    // -----------------------------------------------------------------------
    // 1. PUNCTUALITY (weight 30%)
    // Compare receiving.receivedAt to order.expectedDeliveryDate
    // On-time = receivedAt <= expectedDeliveryDate + 1 day
    // -----------------------------------------------------------------------
    const punctualityRows = await db
      .select({
        receivingId: receivings.id,
        receivedAt: receivings.receivedAt,
        expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
      })
      .from(receivings)
      .innerJoin(purchaseOrders, eq(receivings.orderId, purchaseOrders.id))
      .where(
        and(
          eq(receivings.supplierId, supplierId),
          eq(receivings.tenantId, tenantId),
          eq(receivings.status, 'completed'),
          isNull(receivings.deletedAt),
          gte(receivings.receivedAt, sixMonthsAgo),
        ),
      );

    let punctualityScore: number | null = null;
    let punctualityOnTime = 0;
    let punctualityTotal = 0;

    // Only count rows where expectedDeliveryDate is set
    const punctualityValid = punctualityRows.filter(
      (r: any) => r.expectedDeliveryDate != null,
    );
    punctualityTotal = punctualityValid.length;

    if (punctualityTotal > 0) {
      for (const row of punctualityValid) {
        const received = new Date(row.receivedAt);
        const expected = new Date(row.expectedDeliveryDate);
        // Add 1 day grace period
        const deadline = new Date(expected.getTime() + 24 * 60 * 60 * 1000);
        if (received <= deadline) {
          punctualityOnTime++;
        }
      }
      punctualityScore = (punctualityOnTime / punctualityTotal) * 100;
    }

    // -----------------------------------------------------------------------
    // 2. CONFORMITY (weight 30%)
    // Query receiving_lines for completed receivings in last 6 months
    // Score = (conforming / total) * 100
    // -----------------------------------------------------------------------
    const conformityRows = await db
      .select({
        lineId: receivingLines.id,
        isConforming: receivingLines.isConforming,
      })
      .from(receivingLines)
      .innerJoin(receivings, eq(receivingLines.receivingId, receivings.id))
      .where(
        and(
          eq(receivings.supplierId, supplierId),
          eq(receivings.tenantId, tenantId),
          eq(receivings.status, 'completed'),
          isNull(receivings.deletedAt),
          isNull(receivingLines.deletedAt),
          gte(receivings.receivedAt, sixMonthsAgo),
        ),
      );

    let conformityScore: number | null = null;
    const conformityTotal = conformityRows.length;

    if (conformityTotal > 0) {
      const conformingCount = conformityRows.filter(
        (r: any) => r.isConforming === true,
      ).length;
      conformityScore = (conformingCount / conformityTotal) * 100;
    }

    // -----------------------------------------------------------------------
    // 3. PRICE COMPETITIVENESS (weight 25%)
    // For each active supplier_product, compare its price to the average
    // price across ALL suppliers for the same product within the tenant.
    // Deviation = (supplierPrice - avgPrice) / avgPrice * 100
    // Score per product = max(0, min(100, 100 - (deviation * 2)))
    // Final = average of per-product scores
    // -----------------------------------------------------------------------
    const spRows = await db
      .select({
        productId: supplierProducts.productId,
        currentPrice: supplierProducts.currentPrice,
      })
      .from(supplierProducts)
      .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
      .where(
        and(
          eq(supplierProducts.supplierId, supplierId),
          eq(supplierProducts.isActive, true),
          eq(suppliers.tenantId, tenantId),
          isNull(supplierProducts.deletedAt),
        ),
      );

    let priceScore: number | null = null;
    const priceProductCount = spRows.length;

    if (priceProductCount > 0) {
      // Get average prices for each product across all active suppliers in tenant
      const avgPriceRows = await db
        .select({
          productId: supplierProducts.productId,
          avgPrice:
            sql<string>`AVG(${supplierProducts.currentPrice}::numeric)`.as(
              'avg_price',
            ),
        })
        .from(supplierProducts)
        .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
        .where(
          and(
            eq(suppliers.tenantId, tenantId),
            eq(supplierProducts.isActive, true),
            isNull(suppliers.deletedAt),
            isNull(supplierProducts.deletedAt),
          ),
        )
        .groupBy(supplierProducts.productId);

      const avgPriceMap: Record<string, number> = {};
      for (const row of avgPriceRows) {
        avgPriceMap[row.productId] = parseFloat(row.avgPrice || '0');
      }

      let totalProductScore = 0;
      let scoredProducts = 0;

      for (const sp of spRows) {
        const supplierPrice = parseFloat(sp.currentPrice || '0');
        const avgPrice = avgPriceMap[sp.productId];
        if (!avgPrice || avgPrice === 0) continue;

        const deviationPct =
          ((supplierPrice - avgPrice) / avgPrice) * 100;
        // Positive deviation = more expensive = lower score
        const productScore = Math.max(
          0,
          Math.min(100, 100 - deviationPct * 2),
        );
        totalProductScore += productScore;
        scoredProducts++;
      }

      if (scoredProducts > 0) {
        priceScore = totalProductScore / scoredProducts;
      }
    }

    // -----------------------------------------------------------------------
    // 4. RELIABILITY (weight 15%)
    // Orders that reached at least "received" or "closed" vs total "sent+"
    // (sent, confirmed, in_delivery, partially_received, received, closed)
    // -----------------------------------------------------------------------
    const sentStatuses = [
      'sent',
      'confirmed',
      'in_delivery',
      'partially_received',
      'received',
      'closed',
    ];
    const completedStatuses = ['received', 'closed'];

    const reliabilityRows = await db
      .select({
        orderId: purchaseOrders.id,
        status: purchaseOrders.status,
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.supplierId, supplierId),
          eq(purchaseOrders.tenantId, tenantId),
          isNull(purchaseOrders.deletedAt),
          gte(purchaseOrders.createdAt, sixMonthsAgo),
          sql`${purchaseOrders.status} IN (${sql.join(
            sentStatuses.map((s) => sql`${s}`),
            sql`, `,
          )})`,
        ),
      );

    let reliabilityScore: number | null = null;
    const reliabilityTotal = reliabilityRows.length;

    if (reliabilityTotal > 0) {
      const completedCount = reliabilityRows.filter((r: any) =>
        completedStatuses.includes(r.status),
      ).length;
      reliabilityScore = (completedCount / reliabilityTotal) * 100;
    }

    // -----------------------------------------------------------------------
    // COMPOSITE SCORE
    // Weighted average with weight redistribution for null dimensions
    // -----------------------------------------------------------------------
    const dimensions: { key: string; dim: ScoreDimension }[] = [
      {
        key: 'punctuality',
        dim: {
          score: punctualityScore,
          weight: 30,
          sampleSize: punctualityTotal,
          details: {
            onTime: punctualityOnTime,
            total: punctualityTotal,
          },
        },
      },
      {
        key: 'conformity',
        dim: {
          score: conformityScore,
          weight: 30,
          sampleSize: conformityTotal,
          details: {
            conforming: conformityRows.filter(
              (r: any) => r.isConforming === true,
            ).length,
            total: conformityTotal,
          },
        },
      },
      {
        key: 'priceCompetitiveness',
        dim: {
          score: priceScore,
          weight: 25,
          sampleSize: priceProductCount,
          details: {
            productsEvaluated: priceProductCount,
          },
        },
      },
      {
        key: 'reliability',
        dim: {
          score: reliabilityScore,
          weight: 15,
          sampleSize: reliabilityTotal,
          details: {
            completed: reliabilityRows.filter((r: any) =>
              completedStatuses.includes(r.status),
            ).length,
            totalSent: reliabilityTotal,
          },
        },
      },
    ];

    // Weighted average with redistribution
    let compositeScore: number | null = null;
    const activeDimensions = dimensions.filter(
      (d) => d.dim.score !== null,
    );

    if (activeDimensions.length > 0) {
      const totalWeight = activeDimensions.reduce(
        (sum, d) => sum + d.dim.weight,
        0,
      );
      let weightedSum = 0;
      for (const d of activeDimensions) {
        const redistributedWeight = (d.dim.weight / totalWeight) * 100;
        weightedSum += (d.dim.score! * redistributedWeight) / 100;
      }
      compositeScore = Math.round(weightedSum * 100) / 100;
    }

    const calculatedAt = new Date().toISOString();

    const scoreBreakdown: ScoreBreakdown = {
      supplierId,
      compositeScore,
      punctuality: dimensions[0]!.dim,
      conformity: dimensions[1]!.dim,
      priceCompetitiveness: dimensions[2]!.dim,
      reliability: dimensions[3]!.dim,
      calculatedAt,
    };

    // -----------------------------------------------------------------------
    // Persist to supplier.scoreData JSONB
    // -----------------------------------------------------------------------
    await db
      .update(suppliers)
      .set({
        scoreData: scoreBreakdown,
        updatedAt: new Date(),
      })
      .where(eq(suppliers.id, supplierId));

    return scoreBreakdown;
  }

  /**
   * Recalculate scores for all active suppliers in a tenant.
   */
  static async recalculateAll(db: any, tenantId: string) {
    const activeSuppliers = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(
        and(eq(suppliers.tenantId, tenantId), isNull(suppliers.deletedAt)),
      );

    const results: ScoreBreakdown[] = [];

    for (const supplier of activeSuppliers) {
      const score = await ScoringService.calculateScore(
        db,
        supplier.id,
        tenantId,
      );
      results.push(score);
    }

    return {
      suppliersProcessed: results.length,
      results,
    };
  }

  /**
   * Get the stored score for a supplier (reads from scoreData JSONB).
   */
  static async getScore(
    db: any,
    supplierId: string,
  ): Promise<ScoreBreakdown | null> {
    const [supplier] = await db
      .select({
        id: suppliers.id,
        businessName: suppliers.businessName,
        scoreData: suppliers.scoreData,
      })
      .from(suppliers)
      .where(
        and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)),
      )
      .limit(1);

    if (!supplier) return null;

    if (!supplier.scoreData) {
      return {
        supplierId,
        compositeScore: null,
        punctuality: { score: null, weight: 30, sampleSize: 0 },
        conformity: { score: null, weight: 30, sampleSize: 0 },
        priceCompetitiveness: { score: null, weight: 25, sampleSize: 0 },
        reliability: { score: null, weight: 15, sampleSize: 0 },
        calculatedAt: new Date().toISOString(),
      };
    }

    return supplier.scoreData as ScoreBreakdown;
  }

  /**
   * Get ranking of all suppliers in a tenant, optionally filtered by category.
   * Sorted by compositeScore descending by default, or by a specific dimension.
   */
  static async getRanking(
    db: any,
    tenantId: string,
    category?: string,
    sortBy?: string,
  ) {
    const conditions: any[] = [
      eq(suppliers.tenantId, tenantId),
      isNull(suppliers.deletedAt),
    ];

    if (category) {
      conditions.push(eq(suppliers.category, category as any));
    }

    const rows = await db
      .select({
        id: suppliers.id,
        businessName: suppliers.businessName,
        category: suppliers.category,
        scoreData: suppliers.scoreData,
      })
      .from(suppliers)
      .where(and(...conditions));

    // Map and sort in application layer (scoreData is JSONB, need app-side sort)
    const ranked = rows
      .map((row: any) => {
        const sd = row.scoreData as ScoreBreakdown | null;
        let sortValue: number | null = null;

        if (sd) {
          switch (sortBy) {
            case 'punctuality':
              sortValue = sd.punctuality?.score ?? null;
              break;
            case 'conformity':
              sortValue = sd.conformity?.score ?? null;
              break;
            case 'priceCompetitiveness':
              sortValue = sd.priceCompetitiveness?.score ?? null;
              break;
            case 'reliability':
              sortValue = sd.reliability?.score ?? null;
              break;
            default:
              sortValue = sd.compositeScore;
              break;
          }
        }

        return {
          id: row.id,
          businessName: row.businessName,
          category: row.category,
          compositeScore: sd?.compositeScore ?? null,
          punctuality: sd?.punctuality?.score ?? null,
          conformity: sd?.conformity?.score ?? null,
          priceCompetitiveness: sd?.priceCompetitiveness?.score ?? null,
          reliability: sd?.reliability?.score ?? null,
          calculatedAt: sd?.calculatedAt ?? null,
          _sortValue: sortValue,
        };
      })
      .sort((a: any, b: any) => {
        // Nulls last
        if (a._sortValue === null && b._sortValue === null) return 0;
        if (a._sortValue === null) return 1;
        if (b._sortValue === null) return -1;
        return b._sortValue - a._sortValue;
      })
      .map((item: any, index: number) => {
        const { _sortValue, ...rest } = item;
        return { rank: index + 1, ...rest };
      });

    return ranked;
  }

  /**
   * Risk map: per product category, shows supplier count, average score,
   * and risk level.
   *
   * Risk levels:
   *   - "critical": category has 0 or 1 suppliers, or avg score < 40
   *   - "high": avg score < 60 or only 1-2 suppliers
   *   - "medium": avg score < 75
   *   - "low": avg score >= 75 and >= 3 suppliers
   */
  static async getRiskMap(db: any, tenantId: string) {
    const rows = await db
      .select({
        id: suppliers.id,
        category: suppliers.category,
        scoreData: suppliers.scoreData,
      })
      .from(suppliers)
      .where(
        and(eq(suppliers.tenantId, tenantId), isNull(suppliers.deletedAt)),
      );

    // Group by category
    const categoryMap: Record<
      string,
      {
        suppliers: Array<{
          id: string;
          compositeScore: number | null;
        }>;
      }
    > = {};

    for (const row of rows) {
      const cat = (row as any).category || 'uncategorized';
      if (!categoryMap[cat]) {
        categoryMap[cat] = { suppliers: [] };
      }
      const sd = (row as any).scoreData as ScoreBreakdown | null;
      categoryMap[cat].suppliers.push({
        id: (row as any).id,
        compositeScore: sd?.compositeScore ?? null,
      });
    }

    // For each category, also count expiring documents
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const riskMap = await Promise.all(
      Object.entries(categoryMap).map(async ([category, data]) => {
        const supplierCount = data.suppliers.length;
        const scoredSuppliers = data.suppliers.filter(
          (s) => s.compositeScore !== null,
        );
        const avgScore =
          scoredSuppliers.length > 0
            ? scoredSuppliers.reduce(
                (sum, s) => sum + (s.compositeScore || 0),
                0,
              ) / scoredSuppliers.length
            : null;

        // Count expiring documents for this category
        let expiringDocsCount = 0;
        if (category !== 'uncategorized') {
          const [result] = await db
            .select({ count: count() })
            .from(supplierDocuments)
            .innerJoin(suppliers, eq(supplierDocuments.supplierId, suppliers.id))
            .where(
              and(
                eq(suppliers.tenantId, tenantId),
                eq(suppliers.category, category as any),
                isNull(suppliers.deletedAt),
                isNull(supplierDocuments.deletedAt),
                sql`${supplierDocuments.expiryDate} IS NOT NULL`,
                sql`${supplierDocuments.expiryDate}::date <= ${thirtyDaysFromNow.toISOString().split('T')[0]}`,
              ),
            );
          expiringDocsCount = result?.count || 0;
        }

        // Determine risk level
        let riskLevel: 'critical' | 'high' | 'medium' | 'low';
        if (supplierCount <= 1 && (avgScore === null || avgScore < 40)) {
          riskLevel = 'critical';
        } else if (
          (avgScore !== null && avgScore < 60) ||
          supplierCount <= 1
        ) {
          riskLevel = 'high';
        } else if (avgScore !== null && avgScore < 75) {
          riskLevel = 'medium';
        } else if (avgScore === null && supplierCount <= 2) {
          riskLevel = 'high';
        } else {
          riskLevel = 'low';
        }

        return {
          category,
          supplierCount,
          averageScore:
            avgScore !== null ? Math.round(avgScore * 100) / 100 : null,
          scoredSupplierCount: scoredSuppliers.length,
          expiringDocuments: expiringDocsCount,
          singleSupplierRisk: supplierCount <= 1,
          riskLevel,
        };
      }),
    );

    // Sort by risk level priority
    const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    riskMap.sort(
      (a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel],
    );

    return riskMap;
  }
}

import {
  purchaseOrders,
  orderLines,
  products,
  suppliers,
  invoices,
  supplierDocuments,
  supplierProducts,
} from '@cph/db';
import {
  eq,
  and,
  isNull,
  notInArray,
  gte,
  lte,
  sql,
  count,
  inArray,
} from 'drizzle-orm';
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  subYears,
  format,
} from 'date-fns';
import { createHash } from 'crypto';

type DB = any; // Drizzle database instance
type Redis = any; // ioredis instance

// Statuses excluded from spending calculations
const EXCLUDED_STATUSES = ['draft', 'cancelled', 'pending_approval'];

// Cache TTL in seconds (5 minutes)
const CACHE_TTL = 300;

function buildCacheKey(
  tenantId: string,
  endpoint: string,
  params: Record<string, any>,
): string {
  const paramsHash = createHash('md5')
    .update(JSON.stringify(params))
    .digest('hex')
    .substring(0, 12);
  return `analytics:${tenantId}:${endpoint}:${paramsHash}`;
}

async function getCached<T>(
  redis: Redis | null,
  key: string,
): Promise<T | null> {
  if (!redis) return null;
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // Silently ignore cache errors
  }
  return null;
}

async function setCache(
  redis: Redis | null,
  key: string,
  value: any,
): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL);
  } catch {
    // Silently ignore cache errors
  }
}

/**
 * Helper to get period boundaries
 */
function getPeriodBoundaries(period: string = 'month', referenceDate: Date = new Date()) {
  const periodStart = startOfMonth(referenceDate);
  const periodEnd = endOfMonth(referenceDate);
  return { periodStart, periodEnd };
}

export class AnalyticsService {
  /**
   * GET /spending-overview — current vs previous vs last year
   */
  static async spendingOverview(
    db: DB,
    redis: Redis | null,
    tenantId: string,
    period: string = 'month',
  ) {
    const cacheKey = buildCacheKey(tenantId, 'spending-overview', { period });
    const cached = await getCached<any>(redis, cacheKey);
    if (cached) return cached;

    const now = new Date();
    const current = getPeriodBoundaries(period, now);
    const previous = getPeriodBoundaries(period, subMonths(now, 1));
    const lastYear = getPeriodBoundaries(period, subYears(now, 1));

    const fetchPeriodSpending = async (start: Date, end: Date) => {
      const [result] = await db
        .select({
          amount: sql<string>`COALESCE(SUM(${purchaseOrders.totalAmount}::numeric), 0)`,
          orderCount: count(),
          supplierCount: sql<number>`COUNT(DISTINCT ${purchaseOrders.supplierId})::int`,
        })
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.tenantId, tenantId),
            isNull(purchaseOrders.deletedAt),
            notInArray(purchaseOrders.status, EXCLUDED_STATUSES as any),
            gte(purchaseOrders.createdAt, start),
            lte(purchaseOrders.createdAt, end),
          ),
        );

      return {
        amount: parseFloat(result.amount || '0'),
        orderCount: Number(result.orderCount),
        supplierCount: Number(result.supplierCount),
        startDate: format(start, 'yyyy-MM-dd'),
        endDate: format(end, 'yyyy-MM-dd'),
      };
    };

    const currentPeriod = await fetchPeriodSpending(
      current.periodStart,
      current.periodEnd,
    );
    const previousPeriod = await fetchPeriodSpending(
      previous.periodStart,
      previous.periodEnd,
    );
    const samePeriodLastYear = await fetchPeriodSpending(
      lastYear.periodStart,
      lastYear.periodEnd,
    );

    const vsPrevious =
      previousPeriod.amount > 0
        ? ((currentPeriod.amount - previousPeriod.amount) /
            previousPeriod.amount) *
          100
        : currentPeriod.amount > 0
          ? 100
          : 0;

    const vsLastYear =
      samePeriodLastYear.amount > 0
        ? ((currentPeriod.amount - samePeriodLastYear.amount) /
            samePeriodLastYear.amount) *
          100
        : samePeriodLastYear.amount === 0 && currentPeriod.amount > 0
          ? 100
          : currentPeriod.amount === 0 && samePeriodLastYear.amount === 0
            ? 0
            : null;

    const data = {
      currentPeriod,
      previousPeriod,
      samePeriodLastYear,
      percentChange: {
        vsPrevious: Math.round(vsPrevious * 100) / 100,
        vsLastYear:
          vsLastYear !== null ? Math.round(vsLastYear * 100) / 100 : null,
      },
    };

    await setCache(redis, cacheKey, data);
    return data;
  }

  /**
   * GET /spending-by-category — grouped by product category
   */
  static async spendingByCategory(
    db: DB,
    redis: Redis | null,
    tenantId: string,
    period: string = 'month',
  ) {
    const cacheKey = buildCacheKey(tenantId, 'spending-by-category', { period });
    const cached = await getCached<any>(redis, cacheKey);
    if (cached) return cached;

    const now = new Date();
    const { periodStart, periodEnd } = getPeriodBoundaries(period, now);

    const results = await db
      .select({
        category: sql<string>`COALESCE(${products.category}, 'Non categorizzato')`,
        amount: sql<string>`SUM(${orderLines.lineTotal}::numeric)`,
        orderCount: sql<number>`COUNT(DISTINCT ${purchaseOrders.id})::int`,
      })
      .from(orderLines)
      .innerJoin(purchaseOrders, eq(orderLines.orderId, purchaseOrders.id))
      .innerJoin(products, eq(orderLines.productId, products.id))
      .where(
        and(
          eq(purchaseOrders.tenantId, tenantId),
          isNull(purchaseOrders.deletedAt),
          isNull(orderLines.deletedAt),
          notInArray(purchaseOrders.status, EXCLUDED_STATUSES as any),
          gte(purchaseOrders.createdAt, periodStart),
          lte(purchaseOrders.createdAt, periodEnd),
        ),
      )
      .groupBy(products.category)
      .orderBy(sql`SUM(${orderLines.lineTotal}::numeric) DESC`);

    // Calculate total for percentage
    const totalAmount = results.reduce(
      (sum: number, r: any) => sum + parseFloat(r.amount || '0'),
      0,
    );

    const data = results.map((r: any) => ({
      category: r.category,
      amount: parseFloat(r.amount || '0'),
      percentage:
        totalAmount > 0
          ? Math.round((parseFloat(r.amount || '0') / totalAmount) * 10000) /
            100
          : 0,
      orderCount: Number(r.orderCount),
    }));

    await setCache(redis, cacheKey, data);
    return data;
  }

  /**
   * GET /spending-by-supplier — top N suppliers by spend
   */
  static async spendingBySupplier(
    db: DB,
    redis: Redis | null,
    tenantId: string,
    period: string = 'month',
    limit: number = 10,
  ) {
    const cacheKey = buildCacheKey(tenantId, 'spending-by-supplier', {
      period,
      limit,
    });
    const cached = await getCached<any>(redis, cacheKey);
    if (cached) return cached;

    const now = new Date();
    const { periodStart, periodEnd } = getPeriodBoundaries(period, now);

    const results = await db
      .select({
        supplierId: purchaseOrders.supplierId,
        supplierName: suppliers.businessName,
        amount: sql<string>`SUM(${purchaseOrders.totalAmount}::numeric)`,
        orderCount: sql<number>`COUNT(${purchaseOrders.id})::int`,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(
        and(
          eq(purchaseOrders.tenantId, tenantId),
          isNull(purchaseOrders.deletedAt),
          notInArray(purchaseOrders.status, EXCLUDED_STATUSES as any),
          gte(purchaseOrders.createdAt, periodStart),
          lte(purchaseOrders.createdAt, periodEnd),
        ),
      )
      .groupBy(purchaseOrders.supplierId, suppliers.businessName)
      .orderBy(sql`SUM(${purchaseOrders.totalAmount}::numeric) DESC`)
      .limit(limit);

    // Calculate total for percentage
    const totalAmount = results.reduce(
      (sum: number, r: any) => sum + parseFloat(r.amount || '0'),
      0,
    );

    const data = results.map((r: any) => ({
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      amount: parseFloat(r.amount || '0'),
      percentage:
        totalAmount > 0
          ? Math.round((parseFloat(r.amount || '0') / totalAmount) * 10000) /
            100
          : 0,
      orderCount: Number(r.orderCount),
    }));

    await setCache(redis, cacheKey, data);
    return data;
  }

  /**
   * GET /spending-trend — monthly time series
   */
  static async spendingTrend(
    db: DB,
    redis: Redis | null,
    tenantId: string,
    months: number = 12,
  ) {
    const cacheKey = buildCacheKey(tenantId, 'spending-trend', { months });
    const cached = await getCached<any>(redis, cacheKey);
    if (cached) return cached;

    const now = new Date();
    const startDate = startOfMonth(subMonths(now, months - 1));

    const results = await db
      .select({
        month: sql<string>`TO_CHAR(${purchaseOrders.createdAt}, 'YYYY-MM')`,
        amount: sql<string>`COALESCE(SUM(${purchaseOrders.totalAmount}::numeric), 0)`,
        orderCount: sql<number>`COUNT(${purchaseOrders.id})::int`,
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.tenantId, tenantId),
          isNull(purchaseOrders.deletedAt),
          notInArray(purchaseOrders.status, EXCLUDED_STATUSES as any),
          gte(purchaseOrders.createdAt, startDate),
        ),
      )
      .groupBy(sql`TO_CHAR(${purchaseOrders.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${purchaseOrders.createdAt}, 'YYYY-MM') ASC`);

    // Fill in missing months with zeros
    const data: Array<{ month: string; amount: number; orderCount: number }> = [];
    const resultMap = new Map<string, { amount: number; orderCount: number }>(
      results.map((r: any) => [
        r.month,
        { amount: parseFloat(r.amount || '0'), orderCount: Number(r.orderCount) },
      ]),
    );

    for (let i = 0; i < months; i++) {
      const monthDate = subMonths(now, months - 1 - i);
      const monthKey = format(monthDate, 'yyyy-MM');
      const existing = resultMap.get(monthKey);
      data.push({
        month: monthKey,
        amount: existing?.amount ?? 0,
        orderCount: existing?.orderCount ?? 0,
      });
    }

    await setCache(redis, cacheKey, data);
    return data;
  }

  /**
   * GET /summary — dashboard quick stats
   */
  static async summary(
    db: DB,
    redis: Redis | null,
    tenantId: string,
  ) {
    const cacheKey = buildCacheKey(tenantId, 'summary', {});
    const cached = await getCached<any>(redis, cacheKey);
    if (cached) return cached;

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    // Active suppliers (not soft-deleted)
    const [{ activeSuppliers }] = await db
      .select({ activeSuppliers: count() })
      .from(suppliers)
      .where(
        and(
          eq(suppliers.tenantId, tenantId),
          isNull(suppliers.deletedAt),
        ),
      );

    // Active products (not soft-deleted)
    const [{ activeProducts }] = await db
      .select({ activeProducts: count() })
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          isNull(products.deletedAt),
        ),
      );

    // Orders this month (all non-deleted)
    const [{ ordersThisMonth }] = await db
      .select({ ordersThisMonth: count() })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.tenantId, tenantId),
          isNull(purchaseOrders.deletedAt),
          gte(purchaseOrders.createdAt, monthStart),
          lte(purchaseOrders.createdAt, monthEnd),
        ),
      );

    // Pending approvals
    const [{ pendingApprovals }] = await db
      .select({ pendingApprovals: count() })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.tenantId, tenantId),
          isNull(purchaseOrders.deletedAt),
          eq(purchaseOrders.status, 'pending_approval'),
        ),
      );

    // Unverified invoices (pending_ocr or pending_review)
    const [{ unverifiedInvoices }] = await db
      .select({ unverifiedInvoices: count() })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          isNull(invoices.deletedAt),
          inArray(invoices.status, ['pending_ocr', 'pending_review'] as any),
        ),
      );

    // Expiring documents (within 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const todayStr = format(now, 'yyyy-MM-dd');
    const thirtyDaysStr = format(thirtyDaysFromNow, 'yyyy-MM-dd');

    const [{ expiringDocuments }] = await db
      .select({ expiringDocuments: count() })
      .from(supplierDocuments)
      .innerJoin(suppliers, eq(supplierDocuments.supplierId, suppliers.id))
      .where(
        and(
          eq(suppliers.tenantId, tenantId),
          isNull(supplierDocuments.deletedAt),
          isNull(suppliers.deletedAt),
          sql`${supplierDocuments.expiryDate} IS NOT NULL`,
          gte(supplierDocuments.expiryDate, todayStr),
          lte(supplierDocuments.expiryDate, thirtyDaysStr),
        ),
      );

    // Total spend this month
    const [{ totalSpendThisMonth }] = await db
      .select({
        totalSpendThisMonth: sql<string>`COALESCE(SUM(${purchaseOrders.totalAmount}::numeric), 0)`,
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.tenantId, tenantId),
          isNull(purchaseOrders.deletedAt),
          notInArray(purchaseOrders.status, EXCLUDED_STATUSES as any),
          gte(purchaseOrders.createdAt, monthStart),
          lte(purchaseOrders.createdAt, monthEnd),
        ),
      );

    const data = {
      activeSuppliers: Number(activeSuppliers),
      activeProducts: Number(activeProducts),
      ordersThisMonth: Number(ordersThisMonth),
      pendingApprovals: Number(pendingApprovals),
      unverifiedInvoices: Number(unverifiedInvoices),
      expiringDocuments: Number(expiringDocuments),
      totalSpendThisMonth: parseFloat(totalSpendThisMonth || '0'),
    };

    await setCache(redis, cacheKey, data);
    return data;
  }
}

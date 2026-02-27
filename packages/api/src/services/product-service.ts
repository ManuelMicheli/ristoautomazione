import {
  eq,
  and,
  isNull,
  ilike,
  sql,
  count,
  desc,
  asc,
  gte,
  lte,
  or,
  inArray,
} from 'drizzle-orm';
import {
  products,
  supplierProducts,
  priceHistory,
  suppliers,
} from '@cph/db';

const PRICE_ALERT_THRESHOLD = parseFloat(
  process.env.PRICE_ALERT_THRESHOLD || '5',
);

type Db = any; // FastifyInstance['db'] - Drizzle instance

interface ListFilters {
  page: number;
  pageSize: number;
  q?: string;
  category?: string;
  supplierId?: string;
  isBio?: boolean;
  isDop?: boolean;
  isIgp?: boolean;
  sortBy: 'name' | 'createdAt' | 'category';
  sortDir: 'asc' | 'desc';
}

export class ProductService {
  /**
   * List products with pagination, search, and enriched data.
   */
  async list(db: Db, tenantId: string, filters: ListFilters) {
    const {
      page,
      pageSize,
      q,
      category,
      supplierId,
      isBio,
      isDop,
      isIgp,
      sortBy,
      sortDir,
    } = filters;

    const offset = (page - 1) * pageSize;

    // Build WHERE conditions
    const conditions: any[] = [
      eq(products.tenantId, tenantId),
      isNull(products.deletedAt),
    ];

    if (q) {
      conditions.push(
        or(
          ilike(products.name, `%${q}%`),
          ilike(products.internalCode, `%${q}%`),
        ),
      );
    }
    if (category) {
      conditions.push(eq(products.category, category));
    }
    if (isBio !== undefined) {
      conditions.push(eq(products.isBio, isBio));
    }
    if (isDop !== undefined) {
      conditions.push(eq(products.isDop, isDop));
    }
    if (isIgp !== undefined) {
      conditions.push(eq(products.isIgp, isIgp));
    }

    // If filtering by supplierId, we need to join
    if (supplierId) {
      conditions.push(
        sql`${products.id} IN (
          SELECT ${supplierProducts.productId} FROM ${supplierProducts}
          WHERE ${supplierProducts.supplierId} = ${supplierId}
          AND ${supplierProducts.isActive} = true
          AND ${supplierProducts.deletedAt} IS NULL
        )`,
      );
    }

    // Sort column mapping
    const sortColumnMap = {
      name: products.name,
      createdAt: products.createdAt,
      category: products.category,
    };
    const sortColumn = sortColumnMap[sortBy] || products.name;
    const sortFn = sortDir === 'desc' ? desc : asc;

    // Count total
    const [totalResult] = await db
      .select({ total: count() })
      .from(products)
      .where(and(...conditions));

    const total = Number(totalResult?.total || 0);

    // Fetch products
    const productRows = await db
      .select()
      .from(products)
      .where(and(...conditions))
      .orderBy(sortFn(sortColumn))
      .limit(pageSize)
      .offset(offset);

    if (productRows.length === 0) {
      return {
        data: [],
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    }

    // Enrich with supplier count, best price, and price trend
    const productIds = productRows.map((p: any) => p.id);

    // Supplier count per product
    const supplierCounts = await db
      .select({
        productId: supplierProducts.productId,
        supplierCount: count(),
      })
      .from(supplierProducts)
      .where(
        and(
          inArray(supplierProducts.productId, productIds),
          eq(supplierProducts.isActive, true),
          isNull(supplierProducts.deletedAt),
        ),
      )
      .groupBy(supplierProducts.productId);

    const supplierCountMap = new Map<string, number>();
    for (const row of supplierCounts) {
      supplierCountMap.set(row.productId, Number(row.supplierCount));
    }

    // Best price per product (min currentPrice with supplierName)
    const bestPrices = await db
      .select({
        productId: supplierProducts.productId,
        currentPrice: supplierProducts.currentPrice,
        supplierName: suppliers.businessName,
      })
      .from(supplierProducts)
      .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
      .where(
        and(
          inArray(supplierProducts.productId, productIds),
          eq(supplierProducts.isActive, true),
          isNull(supplierProducts.deletedAt),
        ),
      )
      .orderBy(asc(supplierProducts.currentPrice));

    // Group best prices by product (first one per product = cheapest)
    const bestPriceMap = new Map<
      string,
      { price: string; supplierName: string }
    >();
    for (const row of bestPrices) {
      if (!bestPriceMap.has(row.productId)) {
        bestPriceMap.set(row.productId, {
          price: row.currentPrice,
          supplierName: row.supplierName,
        });
      }
    }

    // Price trend: get the last 2 price history entries per product
    // We need to go through supplierProducts to join priceHistory
    const priceTrends = await db
      .select({
        productId: supplierProducts.productId,
        price: priceHistory.price,
        recordedAt: priceHistory.recordedAt,
      })
      .from(priceHistory)
      .innerJoin(
        supplierProducts,
        eq(priceHistory.supplierProductId, supplierProducts.id),
      )
      .where(inArray(supplierProducts.productId, productIds))
      .orderBy(desc(priceHistory.recordedAt));

    // Group and compute trend per product
    const trendMap = new Map<string, 'up' | 'down' | 'stable' | null>();
    const productPriceEntries = new Map<
      string,
      { price: string; recordedAt: Date }[]
    >();
    for (const row of priceTrends) {
      const entries = productPriceEntries.get(row.productId) || [];
      if (entries.length < 2) {
        entries.push({ price: row.price, recordedAt: row.recordedAt });
        productPriceEntries.set(row.productId, entries);
      }
    }
    for (const [productId, entries] of productPriceEntries) {
      if (entries.length < 2) {
        trendMap.set(productId, null);
      } else {
        const newest = parseFloat(entries[0]!.price);
        const older = parseFloat(entries[1]!.price);
        if (newest > older) trendMap.set(productId, 'up');
        else if (newest < older) trendMap.set(productId, 'down');
        else trendMap.set(productId, 'stable');
      }
    }

    const enrichedProducts = productRows.map((p: any) => {
      const bp = bestPriceMap.get(p.id);

      // Build certifications array from boolean flags
      const certifications: string[] = [];
      if (p.isBio) certifications.push('BIO');
      if (p.isDop) certifications.push('DOP');
      if (p.isIgp) certifications.push('IGP');

      return {
        ...p,
        supplierCount: supplierCountMap.get(p.id) || 0,
        bestPrice: bp ? parseFloat(bp.price) : null,
        bestPriceSupplier: bp ? bp.supplierName : null,
        certifications,
        priceTrend: trendMap.get(p.id) || null,
      };
    });

    return {
      data: enrichedProducts,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Get product by ID with all supplier products and supplier names.
   */
  async getById(db: Db, tenantId: string, productId: string) {
    const [product] = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, productId),
          eq(products.tenantId, tenantId),
          isNull(products.deletedAt),
        ),
      )
      .limit(1);

    if (!product) return null;

    // Get all active supplier products with supplier name, sorted by price ASC
    const spRows = await db
      .select({
        id: supplierProducts.id,
        supplierId: supplierProducts.supplierId,
        supplierCode: supplierProducts.supplierCode,
        currentPrice: supplierProducts.currentPrice,
        currency: supplierProducts.currency,
        minQuantity: supplierProducts.minQuantity,
        priceValidFrom: supplierProducts.priceValidFrom,
        priceValidTo: supplierProducts.priceValidTo,
        isActive: supplierProducts.isActive,
        createdAt: supplierProducts.createdAt,
        updatedAt: supplierProducts.updatedAt,
        supplierName: suppliers.businessName,
      })
      .from(supplierProducts)
      .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
      .where(
        and(
          eq(supplierProducts.productId, productId),
          eq(supplierProducts.isActive, true),
          isNull(supplierProducts.deletedAt),
        ),
      )
      .orderBy(asc(supplierProducts.currentPrice));

    return {
      ...product,
      supplierProducts: spRows.map((sp: any) => ({
        ...sp,
        currentPrice: parseFloat(sp.currentPrice),
        minQuantity: sp.minQuantity ? parseFloat(sp.minQuantity) : null,
      })),
    };
  }

  /**
   * Create a new product.
   */
  async create(db: Db, tenantId: string, data: any) {
    const [product] = await db
      .insert(products)
      .values({
        tenantId,
        name: data.name,
        category: data.category || null,
        unit: data.unit || null,
        weightFormat: data.weightFormat || null,
        internalCode: data.internalCode || null,
        allergens: data.allergens || [],
        isBio: data.isBio || false,
        isDop: data.isDop || false,
        isIgp: data.isIgp || false,
      })
      .returning();

    return product;
  }

  /**
   * Update a product.
   */
  async update(db: Db, tenantId: string, productId: string, data: any) {
    const updateData: any = { updatedAt: new Date() };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.weightFormat !== undefined)
      updateData.weightFormat = data.weightFormat;
    if (data.internalCode !== undefined)
      updateData.internalCode = data.internalCode;
    if (data.allergens !== undefined) updateData.allergens = data.allergens;
    if (data.isBio !== undefined) updateData.isBio = data.isBio;
    if (data.isDop !== undefined) updateData.isDop = data.isDop;
    if (data.isIgp !== undefined) updateData.isIgp = data.isIgp;

    const [updated] = await db
      .update(products)
      .set(updateData)
      .where(
        and(
          eq(products.id, productId),
          eq(products.tenantId, tenantId),
          isNull(products.deletedAt),
        ),
      )
      .returning();

    return updated || null;
  }

  /**
   * Soft delete a product.
   */
  async softDelete(db: Db, tenantId: string, productId: string) {
    const [deleted] = await db
      .update(products)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(products.id, productId),
          eq(products.tenantId, tenantId),
          isNull(products.deletedAt),
        ),
      )
      .returning();

    return deleted || null;
  }

  /**
   * Get all supplier prices for a product (the comparator view).
   */
  async getProductPrices(db: Db, productId: string) {
    const rows = await db
      .select({
        id: supplierProducts.id,
        supplierId: supplierProducts.supplierId,
        supplierCode: supplierProducts.supplierCode,
        currentPrice: supplierProducts.currentPrice,
        currency: supplierProducts.currency,
        minQuantity: supplierProducts.minQuantity,
        priceValidFrom: supplierProducts.priceValidFrom,
        priceValidTo: supplierProducts.priceValidTo,
        isActive: supplierProducts.isActive,
        createdAt: supplierProducts.createdAt,
        updatedAt: supplierProducts.updatedAt,
        supplierName: suppliers.businessName,
      })
      .from(supplierProducts)
      .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
      .where(
        and(
          eq(supplierProducts.productId, productId),
          eq(supplierProducts.isActive, true),
          isNull(supplierProducts.deletedAt),
        ),
      )
      .orderBy(asc(supplierProducts.currentPrice));

    return rows.map((r: any) => ({
      ...r,
      currentPrice: parseFloat(r.currentPrice),
      minQuantity: r.minQuantity ? parseFloat(r.minQuantity) : null,
    }));
  }

  /**
   * Get price history for a supplier product.
   */
  async getPriceHistory(
    db: Db,
    supplierProductId: string,
    dateRange?: { from?: string; to?: string },
  ) {
    const conditions: any[] = [
      eq(priceHistory.supplierProductId, supplierProductId),
    ];

    if (dateRange?.from) {
      conditions.push(gte(priceHistory.recordedAt, new Date(dateRange.from)));
    }
    if (dateRange?.to) {
      conditions.push(lte(priceHistory.recordedAt, new Date(dateRange.to)));
    }

    const rows = await db
      .select({
        id: priceHistory.id,
        price: priceHistory.price,
        recordedAt: priceHistory.recordedAt,
        changedBy: priceHistory.changedBy,
        supplierName: suppliers.businessName,
      })
      .from(priceHistory)
      .innerJoin(
        supplierProducts,
        eq(priceHistory.supplierProductId, supplierProducts.id),
      )
      .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
      .where(and(...conditions))
      .orderBy(asc(priceHistory.recordedAt));

    return rows.map((r: any) => ({
      date: r.recordedAt,
      price: parseFloat(r.price),
      supplierName: r.supplierName,
    }));
  }

  /**
   * Link a product to a supplier (create supplierProduct + initial priceHistory).
   */
  async linkSupplierProduct(db: Db, productId: string, data: any) {
    const [sp] = await db
      .insert(supplierProducts)
      .values({
        productId,
        supplierId: data.supplierId,
        supplierCode: data.supplierCode || null,
        currentPrice: String(data.currentPrice),
        minQuantity: data.minQuantity != null ? String(data.minQuantity) : null,
        priceValidFrom: data.priceValidFrom || null,
        priceValidTo: data.priceValidTo || null,
        isActive: true,
      })
      .returning();

    // Record initial price history entry
    await db.insert(priceHistory).values({
      supplierProductId: sp.id,
      price: String(data.currentPrice),
      recordedAt: new Date(),
    });

    return sp;
  }

  /**
   * Update supplier product price. Records old price in history.
   * Returns alert if price increase exceeds threshold.
   */
  async updatePrice(
    db: Db,
    supplierProductId: string,
    data: any,
    userId: string,
    _tenantId: string,
  ) {
    // Get current supplier product
    const [current] = await db
      .select()
      .from(supplierProducts)
      .where(
        and(
          eq(supplierProducts.id, supplierProductId),
          isNull(supplierProducts.deletedAt),
        ),
      )
      .limit(1);

    if (!current) return null;

    const oldPrice = parseFloat(current.currentPrice);
    const newPrice = data.currentPrice;

    // Record old price in price history
    await db.insert(priceHistory).values({
      supplierProductId,
      price: String(oldPrice),
      recordedAt: new Date(),
      changedBy: userId,
    });

    // Update supplier product
    const updateData: any = {
      currentPrice: String(newPrice),
      updatedAt: new Date(),
    };
    if (data.minQuantity !== undefined) {
      updateData.minQuantity =
        data.minQuantity != null ? String(data.minQuantity) : null;
    }
    if (data.priceValidFrom !== undefined) {
      updateData.priceValidFrom = data.priceValidFrom;
    }
    if (data.priceValidTo !== undefined) {
      updateData.priceValidTo = data.priceValidTo;
    }

    const [updated] = await db
      .update(supplierProducts)
      .set(updateData)
      .where(eq(supplierProducts.id, supplierProductId))
      .returning();

    // Check for price alert
    let priceAlert: {
      oldPrice: number;
      newPrice: number;
      changePercent: number;
    } | null = null;

    if (oldPrice > 0 && newPrice > oldPrice) {
      const changePercent = ((newPrice - oldPrice) / oldPrice) * 100;
      if (changePercent > PRICE_ALERT_THRESHOLD) {
        priceAlert = {
          oldPrice,
          newPrice,
          changePercent: Math.round(changePercent * 100) / 100,
        };
      }
    }

    return {
      updated,
      priceAlert: priceAlert || undefined,
    };
  }

  /**
   * Get recent price alerts (price increases above threshold).
   */
  async getPriceAlerts(
    db: Db,
    tenantId: string,
    page: number,
    pageSize: number,
  ) {
    const offset = (page - 1) * pageSize;
    const threshold = PRICE_ALERT_THRESHOLD;

    // We look for consecutive priceHistory entries where the newer price
    // is significantly higher than the previous one.
    // Use a window function approach via raw SQL for efficiency.
    const alertsQuery = sql`
      WITH ranked_prices AS (
        SELECT
          ph.id,
          ph.supplier_product_id,
          ph.price,
          ph.recorded_at,
          ph.changed_by,
          LAG(ph.price) OVER (
            PARTITION BY ph.supplier_product_id
            ORDER BY ph.recorded_at
          ) AS prev_price,
          sp.product_id,
          sp.supplier_id,
          s.business_name AS supplier_name,
          p.name AS product_name,
          p.tenant_id
        FROM price_history ph
        INNER JOIN supplier_products sp ON ph.supplier_product_id = sp.id
        INNER JOIN suppliers s ON sp.supplier_id = s.id
        INNER JOIN products p ON sp.product_id = p.id
        WHERE p.tenant_id = ${tenantId}
          AND p.deleted_at IS NULL
          AND sp.deleted_at IS NULL
      )
      SELECT
        id,
        supplier_product_id,
        price,
        prev_price,
        recorded_at,
        changed_by,
        product_id,
        supplier_id,
        supplier_name,
        product_name,
        ROUND(((price::numeric - prev_price::numeric) / NULLIF(prev_price::numeric, 0)) * 100, 2) AS change_percent
      FROM ranked_prices
      WHERE prev_price IS NOT NULL
        AND price::numeric > prev_price::numeric
        AND ((price::numeric - prev_price::numeric) / NULLIF(prev_price::numeric, 0)) * 100 > ${threshold}
      ORDER BY recorded_at DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `;

    const countQuery = sql`
      WITH ranked_prices AS (
        SELECT
          ph.price,
          LAG(ph.price) OVER (
            PARTITION BY ph.supplier_product_id
            ORDER BY ph.recorded_at
          ) AS prev_price,
          p.tenant_id,
          p.deleted_at AS p_deleted_at,
          sp.deleted_at AS sp_deleted_at
        FROM price_history ph
        INNER JOIN supplier_products sp ON ph.supplier_product_id = sp.id
        INNER JOIN products p ON sp.product_id = p.id
        WHERE p.tenant_id = ${tenantId}
          AND p.deleted_at IS NULL
          AND sp.deleted_at IS NULL
      )
      SELECT COUNT(*)::int AS total
      FROM ranked_prices
      WHERE prev_price IS NOT NULL
        AND price::numeric > prev_price::numeric
        AND ((price::numeric - prev_price::numeric) / NULLIF(prev_price::numeric, 0)) * 100 > ${threshold}
    `;

    const alertRows = await db.execute(alertsQuery);
    const [countResult] = await db.execute(countQuery);
    const total = Number(countResult?.total || 0);

    const alerts = (alertRows.rows || alertRows).map((r: any) => ({
      id: r.id,
      supplierProductId: r.supplier_product_id,
      productId: r.product_id,
      productName: r.product_name,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      oldPrice: parseFloat(r.prev_price),
      newPrice: parseFloat(r.price),
      changePercent: parseFloat(r.change_percent),
      recordedAt: r.recorded_at,
      changedBy: r.changed_by,
    }));

    return {
      data: alerts,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}

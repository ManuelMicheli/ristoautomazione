import {
  eq,
  and,
  isNull,
  inArray,
  asc,
} from 'drizzle-orm';
import {
  products,
  suppliers,
  supplierProducts,
  purchaseOrders,
  orderLines,
  shoppingTemplates,
  locations,
} from '@cph/db';

type DB = any; // Drizzle database instance

// ---------- Types ----------

export interface ShoppingItem {
  productId: string;
  quantity: number;
}

export interface OptimizedLineItem {
  productId: string;
  productName: string;
  productUnit: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  supplierProductId: string;
}

export interface OptimizedOrder {
  supplierId: string;
  supplierName: string;
  minimumOrderAmount: number | null;
  items: OptimizedLineItem[];
  subtotal: number;
  warnings: string[];
}

export interface OptimizeResult {
  orders: OptimizedOrder[];
  totalAmount: number;
  totalSavings: number;
  unassignedItems: Array<{ productId: string; productName: string; reason: string }>;
}

// ---------- Service ----------

export class ShoppingListService {
  /**
   * Core optimization: assigns each item to cheapest supplier,
   * then rebalances for minimum order amounts, lead time, and delivery days.
   */
  async optimize(
    db: DB,
    tenantId: string,
    request: { items: ShoppingItem[]; desiredDeliveryDate?: string },
  ): Promise<OptimizeResult> {
    const { items, desiredDeliveryDate } = request;

    if (items.length === 0) {
      return { orders: [], totalAmount: 0, totalSavings: 0, unassignedItems: [] };
    }

    const productIds = items.map((i) => i.productId);

    // 1. Fetch all active supplier-product links for requested products
    const spRows = await db
      .select({
        spId: supplierProducts.id,
        productId: supplierProducts.productId,
        supplierId: supplierProducts.supplierId,
        currentPrice: supplierProducts.currentPrice,
        supplierName: suppliers.businessName,
        minimumOrderAmount: suppliers.minimumOrderAmount,
        deliveryDays: suppliers.deliveryDays,
        leadTimeDays: suppliers.leadTimeDays,
        productName: products.name,
        productUnit: products.unit,
      })
      .from(supplierProducts)
      .innerJoin(
        suppliers,
        and(
          eq(supplierProducts.supplierId, suppliers.id),
          isNull(suppliers.deletedAt),
        ),
      )
      .innerJoin(products, eq(supplierProducts.productId, products.id))
      .where(
        and(
          inArray(supplierProducts.productId, productIds),
          eq(supplierProducts.isActive, true),
          isNull(supplierProducts.deletedAt),
          eq(suppliers.tenantId, tenantId),
        ),
      )
      .orderBy(asc(supplierProducts.currentPrice));

    // 2. Build a map: productId -> sorted supplier options
    const optionsMap = new Map<string, typeof spRows>();
    for (const row of spRows) {
      const existing = optionsMap.get(row.productId) ?? [];
      existing.push(row);
      optionsMap.set(row.productId, existing);
    }

    // 3. Filter suppliers by delivery constraints if date specified
    const excludedSupplierIds = new Set<string>();
    if (desiredDeliveryDate) {
      const deliveryDate = new Date(desiredDeliveryDate);
      const today = new Date();
      const daysUntilDelivery = Math.ceil(
        (deliveryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      const deliveryDayOfWeek = deliveryDate.getDay(); // 0=Sun, 1=Mon...

      const allSupplierIds = new Set<string>(spRows.map((r: any) => r.supplierId as string));
      for (const sid of allSupplierIds) {
        const sample = spRows.find((r: any) => r.supplierId === sid)!;
        const lead = sample.leadTimeDays ?? 0;
        const days = (sample.deliveryDays as number[]) ?? [];

        if (lead > daysUntilDelivery) {
          excludedSupplierIds.add(sid);
          continue;
        }
        if (days.length > 0 && !days.includes(deliveryDayOfWeek)) {
          excludedSupplierIds.add(sid);
        }
      }
    }

    // 4. Initial assignment: cheapest supplier per product
    const assignments = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        minimumOrderAmount: number | null;
        spId: string;
        productId: string;
        productName: string;
        productUnit: string | null;
        quantity: number;
        unitPrice: number;
      }
    >();

    const unassigned: OptimizeResult['unassignedItems'] = [];

    for (const item of items) {
      const options = (optionsMap.get(item.productId) ?? []).filter(
        (o: any) => !excludedSupplierIds.has(o.supplierId),
      );

      if (options.length === 0) {
        const anyOption = optionsMap.get(item.productId);
        const name = anyOption?.[0]?.productName ?? item.productId;
        unassigned.push({
          productId: item.productId,
          productName: name,
          reason:
            excludedSupplierIds.size > 0
              ? 'Nessun fornitore disponibile per la data richiesta'
              : 'Nessun fornitore ha questo prodotto a catalogo',
        });
        continue;
      }

      const best = options[0]!;
      assignments.set(item.productId, {
        supplierId: best.supplierId,
        supplierName: best.supplierName,
        minimumOrderAmount: best.minimumOrderAmount
          ? parseFloat(best.minimumOrderAmount as any)
          : null,
        spId: best.spId,
        productId: best.productId,
        productName: best.productName,
        productUnit: best.productUnit,
        quantity: item.quantity,
        unitPrice: parseFloat(best.currentPrice as any),
      });
    }

    // 5. Build virtual orders per supplier
    const buildOrders = (): Map<string, OptimizedOrder> => {
      const orderMap = new Map<string, OptimizedOrder>();
      for (const a of assignments.values()) {
        let order = orderMap.get(a.supplierId);
        if (!order) {
          order = {
            supplierId: a.supplierId,
            supplierName: a.supplierName,
            minimumOrderAmount: a.minimumOrderAmount,
            items: [],
            subtotal: 0,
            warnings: [],
          };
          orderMap.set(a.supplierId, order);
        }
        const lineTotal = Math.round(a.quantity * a.unitPrice * 100) / 100;
        order.items.push({
          productId: a.productId,
          productName: a.productName,
          productUnit: a.productUnit,
          quantity: a.quantity,
          unitPrice: a.unitPrice,
          lineTotal,
          supplierProductId: a.spId,
        });
        order.subtotal = Math.round((order.subtotal + lineTotal) * 100) / 100;
      }
      return orderMap;
    };

    // 6. Rebalance for minimum order amounts
    let orderMap = buildOrders();

    for (const [supplierId, order] of orderMap) {
      if (
        order.minimumOrderAmount &&
        order.subtotal < order.minimumOrderAmount
      ) {
        const gap = order.minimumOrderAmount - order.subtotal;
        let moved = false;

        for (const [otherSupplierId, otherOrder] of orderMap) {
          if (otherSupplierId === supplierId) continue;

          for (const otherItem of otherOrder.items) {
            const altOptions = (optionsMap.get(otherItem.productId) ?? []).filter(
              (o: any) =>
                o.supplierId === supplierId &&
                !excludedSupplierIds.has(o.supplierId),
            );

            if (altOptions.length === 0) continue;

            const altPrice = parseFloat(altOptions[0]!.currentPrice as any);
            const priceDiff =
              (altPrice - otherItem.unitPrice) * otherItem.quantity;

            if (priceDiff < gap * 0.5) {
              assignments.set(otherItem.productId, {
                supplierId,
                supplierName: order.supplierName,
                minimumOrderAmount: order.minimumOrderAmount,
                spId: altOptions[0]!.spId,
                productId: otherItem.productId,
                productName: otherItem.productName,
                productUnit: otherItem.productUnit,
                quantity: otherItem.quantity,
                unitPrice: altPrice,
              });
              moved = true;
              break;
            }
          }
          if (moved) break;
        }

        if (moved) {
          orderMap = buildOrders();
        }
      }
    }

    // 7. Add warnings for remaining under-minimum orders
    for (const order of orderMap.values()) {
      if (
        order.minimumOrderAmount &&
        order.subtotal < order.minimumOrderAmount
      ) {
        order.warnings.push(
          `Ordine sotto il minimo di \u20AC${order.minimumOrderAmount.toFixed(2)} (mancano \u20AC${(order.minimumOrderAmount - order.subtotal).toFixed(2)})`,
        );
      }
    }

    // 8. Calculate savings (vs worst-case: most expensive supplier for each item)
    let worstCaseTotal = 0;
    for (const item of items) {
      const options = optionsMap.get(item.productId) ?? [];
      if (options.length > 0) {
        const worstPrice = parseFloat(
          options[options.length - 1]!.currentPrice as any,
        );
        worstCaseTotal += worstPrice * item.quantity;
      }
    }

    const totalAmount = Array.from(orderMap.values()).reduce(
      (s, o) => s + o.subtotal,
      0,
    );
    const totalSavings =
      Math.round((worstCaseTotal - totalAmount) * 100) / 100;

    return {
      orders: Array.from(orderMap.values()).filter((o) => o.items.length > 0),
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalSavings: Math.max(0, totalSavings),
      unassignedItems: unassigned,
    };
  }

  /**
   * Generate draft purchase orders from an optimized result.
   */
  async generateOrders(
    db: DB,
    tenantId: string,
    userId: string,
    locationId: string | undefined,
    optimizedOrders: OptimizedOrder[],
    deliveryDate?: string,
    notes?: string,
  ): Promise<string[]> {
    const orderIds: string[] = [];

    await db.transaction(async (tx: any) => {
      // Resolve locationId if not provided
      let resolvedLocationId = locationId;
      if (!resolvedLocationId) {
        const [loc] = await tx
          .select({ id: locations.id })
          .from(locations)
          .where(
            and(eq(locations.tenantId, tenantId), isNull(locations.deletedAt)),
          )
          .limit(1);
        if (!loc) {
          throw Object.assign(
            new Error('Nessuna sede trovata per il tenant'),
            { statusCode: 400 },
          );
        }
        resolvedLocationId = loc.id;
      }

      for (const opt of optimizedOrders) {
        const [order] = await tx
          .insert(purchaseOrders)
          .values({
            tenantId,
            locationId: resolvedLocationId,
            supplierId: opt.supplierId,
            status: 'draft',
            totalAmount: opt.subtotal.toFixed(2),
            notes: notes || 'Generato da Lista della Spesa',
            expectedDeliveryDate: deliveryDate ?? null,
            isUrgent: false,
            isRecurringTemplate: false,
            createdBy: userId,
          })
          .returning();
        if (!order) throw new Error('Failed to create order');

        for (const item of opt.items) {
          await tx.insert(orderLines).values({
            orderId: order.id,
            productId: item.productId,
            supplierProductId: item.supplierProductId,
            quantity: item.quantity.toFixed(3),
            unitPrice: item.unitPrice.toFixed(4),
            lineTotal: item.lineTotal.toFixed(2),
          });
        }

        orderIds.push(order.id);
      }
    });

    return orderIds;
  }

  // ---------- Templates CRUD ----------

  async listTemplates(db: DB, tenantId: string) {
    return db
      .select()
      .from(shoppingTemplates)
      .where(
        and(
          eq(shoppingTemplates.tenantId, tenantId),
          isNull(shoppingTemplates.deletedAt),
        ),
      );
  }

  async createTemplate(
    db: DB,
    tenantId: string,
    userId: string,
    data: { name: string; frequency: string; items: ShoppingItem[] },
  ) {
    const [template] = await db
      .insert(shoppingTemplates)
      .values({
        tenantId,
        name: data.name,
        frequency: data.frequency as any,
        items: data.items,
        createdBy: userId,
      })
      .returning();
    return template;
  }

  async updateTemplate(
    db: DB,
    templateId: string,
    data: { name?: string; frequency?: string; items?: ShoppingItem[] },
  ) {
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (data.name) updates.name = data.name;
    if (data.frequency) updates.frequency = data.frequency;
    if (data.items) updates.items = data.items;

    const [updated] = await db
      .update(shoppingTemplates)
      .set(updates)
      .where(eq(shoppingTemplates.id, templateId))
      .returning();
    return updated;
  }

  async deleteTemplate(db: DB, templateId: string) {
    await db
      .update(shoppingTemplates)
      .set({ deletedAt: new Date() })
      .where(eq(shoppingTemplates.id, templateId));
  }

  async getTemplate(db: DB, templateId: string) {
    const [template] = await db
      .select()
      .from(shoppingTemplates)
      .where(
        and(
          eq(shoppingTemplates.id, templateId),
          isNull(shoppingTemplates.deletedAt),
        ),
      );
    return template;
  }

  /**
   * Parse a CSV shopping list (product name/code + quantity).
   * Returns items matched to product IDs.
   */
  async parseCSV(
    db: DB,
    tenantId: string,
    csvContent: string,
  ): Promise<{
    matched: ShoppingItem[];
    unmatched: Array<{ row: number; name: string; quantity: number }>;
  }> {
    const lines = csvContent.trim().split(/\r?\n/);
    const delimiter = lines[0]?.includes(';') ? ';' : ',';

    const matched: ShoppingItem[] = [];
    const unmatched: Array<{ row: number; name: string; quantity: number }> =
      [];

    // Fetch all products for this tenant
    const allProducts = await db
      .select({
        id: products.id,
        name: products.name,
        internalCode: products.internalCode,
      })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), isNull(products.deletedAt)));

    const nameMap = new Map<string, string>(
      allProducts.map((p: any) => [p.name.toLowerCase(), p.id] as [string, string]),
    );
    const codeMap = new Map<string, string>(
      allProducts
        .filter((p: any) => p.internalCode)
        .map((p: any) => [p.internalCode!.toLowerCase(), p.id] as [string, string]),
    );

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i]!
        .split(delimiter)
        .map((c: string) => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 2) continue;

      const nameOrCode = cols[0]!;
      const quantity = parseFloat(cols[1]!);
      if (isNaN(quantity) || quantity <= 0) continue;

      const productId =
        codeMap.get(nameOrCode.toLowerCase()) ??
        nameMap.get(nameOrCode.toLowerCase());

      if (productId) {
        matched.push({ productId, quantity });
      } else {
        unmatched.push({ row: i + 1, name: nameOrCode, quantity });
      }
    }

    return { matched, unmatched };
  }
}

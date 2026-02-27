import {
  receivings,
  receivingLines,
  nonConformities,
  purchaseOrders,
  orderLines,
  suppliers,
  products,
} from '@cph/db';
import {
  eq,
  and,
  isNull,
  inArray,
  gte,
  lte,
  desc,
  sql,
  count,
} from 'drizzle-orm';
import type { z } from 'zod';
import type {
  listReceivingsQuerySchema,
  updateReceivingLineSchema,
  createNonConformitySchema,
  discrepancyReportQuerySchema,
} from '../routes/receivings/schemas';

type DB = any; // Drizzle database instance

export class ReceivingService {
  /**
   * List receivings with pagination, filter by supplier/date/status.
   * Includes supplier name, order number, lines count, non-conformities count.
   */
  static async list(
    db: DB,
    tenantId: string,
    filters: z.infer<typeof listReceivingsQuerySchema>,
  ) {
    const { page, pageSize, supplierId, dateFrom, dateTo, status } = filters;

    const conditions: any[] = [
      eq(receivings.tenantId, tenantId),
      isNull(receivings.deletedAt),
    ];

    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        conditions.push(inArray(receivings.status, statuses as any));
      }
    }

    if (supplierId) {
      conditions.push(eq(receivings.supplierId, supplierId));
    }

    if (dateFrom) {
      conditions.push(gte(receivings.receivedAt, new Date(dateFrom)));
    }

    if (dateTo) {
      conditions.push(lte(receivings.receivedAt, new Date(dateTo)));
    }

    const whereClause = and(...conditions);

    // Count total
    const [{ total }] = await db
      .select({ total: count() })
      .from(receivings)
      .where(whereClause);

    // Fetch receivings with supplier name, order number, lines count, NC count
    const rows = await db
      .select({
        id: receivings.id,
        tenantId: receivings.tenantId,
        orderId: receivings.orderId,
        supplierId: receivings.supplierId,
        supplierName: suppliers.businessName,
        orderNumber: purchaseOrders.orderNumber,
        receivedAt: receivings.receivedAt,
        receivedBy: receivings.receivedBy,
        status: receivings.status,
        notes: receivings.notes,
        createdAt: receivings.createdAt,
        updatedAt: receivings.updatedAt,
        linesCount: sql<number>`(
          SELECT COUNT(*)::int FROM receiving_lines
          WHERE receiving_lines.receiving_id = ${receivings.id}
          AND receiving_lines.deleted_at IS NULL
        )`.as('lines_count'),
        nonConformitiesCount: sql<number>`(
          SELECT COUNT(*)::int FROM non_conformities nc
          INNER JOIN receiving_lines rl ON rl.id = nc.receiving_line_id
          WHERE rl.receiving_id = ${receivings.id}
          AND rl.deleted_at IS NULL
          AND nc.deleted_at IS NULL
        )`.as('non_conformities_count'),
      })
      .from(receivings)
      .leftJoin(suppliers, eq(receivings.supplierId, suppliers.id))
      .leftJoin(purchaseOrders, eq(receivings.orderId, purchaseOrders.id))
      .where(whereClause)
      .orderBy(desc(receivings.receivedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      data: rows,
      pagination: {
        page,
        pageSize,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / pageSize),
      },
    };
  }

  /**
   * Create receiving for an order.
   * Pre-populate receiving_lines from order_lines.
   */
  static async create(
    db: DB,
    tenantId: string,
    userId: string,
    orderId: string,
  ) {
    return await db.transaction(async (tx: DB) => {
      // Fetch the order
      const [order] = await tx
        .select()
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.id, orderId),
            eq(purchaseOrders.tenantId, tenantId),
            isNull(purchaseOrders.deletedAt),
          ),
        );

      if (!order) {
        throw Object.assign(new Error('Ordine non trovato'), {
          statusCode: 404,
        });
      }

      // Validate order status allows receiving
      const allowedStatuses = ['confirmed', 'in_delivery', 'sent', 'partially_received'];
      if (!allowedStatuses.includes(order.status)) {
        throw Object.assign(
          new Error(
            `L'ordine deve essere in stato confermato o in consegna per poter ricevere (stato attuale: ${order.status})`,
          ),
          { statusCode: 400 },
        );
      }

      // Create the receiving record
      const [receiving] = await tx
        .insert(receivings)
        .values({
          tenantId,
          orderId,
          supplierId: order.supplierId,
          receivedBy: userId,
          status: 'in_progress',
        })
        .returning();

      // Get order lines
      const lines = await tx
        .select()
        .from(orderLines)
        .where(
          and(
            eq(orderLines.orderId, orderId),
            isNull(orderLines.deletedAt),
          ),
        );

      // Pre-populate receiving lines from order lines
      const insertedLines: any[] = [];
      for (const line of lines) {
        const [rl] = await tx
          .insert(receivingLines)
          .values({
            receivingId: receiving.id,
            orderLineId: line.id,
            productId: line.productId,
            quantityOrdered: line.quantity,
            quantityReceived: null,
            isConforming: true,
          })
          .returning();
        insertedLines.push(rl);
      }

      return {
        ...receiving,
        lines: insertedLines,
      };
    });
  }

  /**
   * Get receiving by ID with full detail: lines (product name, unit),
   * non-conformities per line, order reference.
   */
  static async getById(db: DB, receivingId: string) {
    // Get receiving with supplier and order info
    const [receiving] = await db
      .select({
        id: receivings.id,
        tenantId: receivings.tenantId,
        orderId: receivings.orderId,
        supplierId: receivings.supplierId,
        supplierName: suppliers.businessName,
        orderNumber: purchaseOrders.orderNumber,
        receivedAt: receivings.receivedAt,
        receivedBy: receivings.receivedBy,
        signatureData: receivings.signatureData,
        notes: receivings.notes,
        status: receivings.status,
        createdAt: receivings.createdAt,
        updatedAt: receivings.updatedAt,
      })
      .from(receivings)
      .leftJoin(suppliers, eq(receivings.supplierId, suppliers.id))
      .leftJoin(purchaseOrders, eq(receivings.orderId, purchaseOrders.id))
      .where(
        and(
          eq(receivings.id, receivingId),
          isNull(receivings.deletedAt),
        ),
      );

    if (!receiving) return null;

    // Get receiving lines with product info
    const lines = await db
      .select({
        id: receivingLines.id,
        receivingId: receivingLines.receivingId,
        orderLineId: receivingLines.orderLineId,
        productId: receivingLines.productId,
        productName: products.name,
        productUnit: products.unit,
        quantityOrdered: receivingLines.quantityOrdered,
        quantityReceived: receivingLines.quantityReceived,
        isConforming: receivingLines.isConforming,
        temperature: receivingLines.temperature,
        notes: receivingLines.notes,
        createdAt: receivingLines.createdAt,
        updatedAt: receivingLines.updatedAt,
      })
      .from(receivingLines)
      .leftJoin(products, eq(receivingLines.productId, products.id))
      .where(
        and(
          eq(receivingLines.receivingId, receivingId),
          isNull(receivingLines.deletedAt),
        ),
      );

    // Get non-conformities grouped by line
    const ncs = await db
      .select({
        id: nonConformities.id,
        receivingLineId: nonConformities.receivingLineId,
        type: nonConformities.type,
        severity: nonConformities.severity,
        description: nonConformities.description,
        photoPaths: nonConformities.photoPaths,
        resolved: nonConformities.resolved,
        resolvedAt: nonConformities.resolvedAt,
        resolvedBy: nonConformities.resolvedBy,
        resolutionNotes: nonConformities.resolutionNotes,
        createdAt: nonConformities.createdAt,
      })
      .from(nonConformities)
      .innerJoin(
        receivingLines,
        eq(nonConformities.receivingLineId, receivingLines.id),
      )
      .where(
        and(
          eq(receivingLines.receivingId, receivingId),
          isNull(receivingLines.deletedAt),
          isNull(nonConformities.deletedAt),
        ),
      );

    // Group NCs by line
    const ncsByLine: Record<string, typeof ncs> = {};
    for (const nc of ncs) {
      if (!ncsByLine[nc.receivingLineId]) {
        ncsByLine[nc.receivingLineId] = [];
      }
      ncsByLine[nc.receivingLineId].push(nc);
    }

    // Attach NCs to lines
    const linesWithNcs = lines.map((line: any) => ({
      ...line,
      nonConformities: ncsByLine[line.id] || [],
    }));

    return {
      ...receiving,
      lines: linesWithNcs,
    };
  }

  /**
   * Update a receiving line: quantity_received, is_conforming, temperature, notes.
   */
  static async updateLine(
    db: DB,
    lineId: string,
    data: z.infer<typeof updateReceivingLineSchema>,
  ) {
    // Verify the line exists and its receiving is in_progress
    const [line] = await db
      .select({
        id: receivingLines.id,
        receivingId: receivingLines.receivingId,
        receivingStatus: receivings.status,
      })
      .from(receivingLines)
      .innerJoin(receivings, eq(receivingLines.receivingId, receivings.id))
      .where(
        and(
          eq(receivingLines.id, lineId),
          isNull(receivingLines.deletedAt),
        ),
      );

    if (!line) {
      throw Object.assign(new Error('Riga ricevimento non trovata'), {
        statusCode: 404,
      });
    }

    if (line.receivingStatus !== 'in_progress') {
      throw Object.assign(
        new Error('Il ricevimento e gia completato e non puo essere modificato'),
        { statusCode: 400 },
      );
    }

    const [updated] = await db
      .update(receivingLines)
      .set({
        quantityReceived: String(data.quantityReceived),
        isConforming: data.isConforming,
        temperature: data.temperature !== undefined ? String(data.temperature) : undefined,
        notes: data.notes,
        updatedAt: new Date(),
      })
      .where(eq(receivingLines.id, lineId))
      .returning();

    return updated;
  }

  /**
   * Add a non-conformity to a receiving line.
   * Marks the line as non-conforming.
   */
  static async addNonConformity(
    db: DB,
    lineId: string,
    data: z.infer<typeof createNonConformitySchema>,
    photos: string[],
  ) {
    return await db.transaction(async (tx: DB) => {
      // Verify line exists
      const [line] = await tx
        .select({
          id: receivingLines.id,
          receivingId: receivingLines.receivingId,
          receivingStatus: receivings.status,
        })
        .from(receivingLines)
        .innerJoin(receivings, eq(receivingLines.receivingId, receivings.id))
        .where(
          and(
            eq(receivingLines.id, lineId),
            isNull(receivingLines.deletedAt),
          ),
        );

      if (!line) {
        throw Object.assign(new Error('Riga ricevimento non trovata'), {
          statusCode: 404,
        });
      }

      if (line.receivingStatus !== 'in_progress') {
        throw Object.assign(
          new Error('Il ricevimento e gia completato'),
          { statusCode: 400 },
        );
      }

      // Insert non-conformity
      const [nc] = await tx
        .insert(nonConformities)
        .values({
          receivingLineId: lineId,
          type: data.type,
          severity: data.severity,
          description: data.description || null,
          photoPaths: photos,
        })
        .returning();

      // Mark line as non-conforming
      await tx
        .update(receivingLines)
        .set({
          isConforming: false,
          updatedAt: new Date(),
        })
        .where(eq(receivingLines.id, lineId));

      return nc;
    });
  }

  /**
   * Get all non-conformities for a receiving, grouped by line.
   */
  static async getNonConformities(db: DB, receivingId: string) {
    const ncs = await db
      .select({
        id: nonConformities.id,
        receivingLineId: nonConformities.receivingLineId,
        productName: products.name,
        type: nonConformities.type,
        severity: nonConformities.severity,
        description: nonConformities.description,
        photoPaths: nonConformities.photoPaths,
        resolved: nonConformities.resolved,
        resolvedAt: nonConformities.resolvedAt,
        resolvedBy: nonConformities.resolvedBy,
        resolutionNotes: nonConformities.resolutionNotes,
        createdAt: nonConformities.createdAt,
      })
      .from(nonConformities)
      .innerJoin(
        receivingLines,
        eq(nonConformities.receivingLineId, receivingLines.id),
      )
      .leftJoin(products, eq(receivingLines.productId, products.id))
      .where(
        and(
          eq(receivingLines.receivingId, receivingId),
          isNull(receivingLines.deletedAt),
          isNull(nonConformities.deletedAt),
        ),
      )
      .orderBy(desc(nonConformities.createdAt));

    // Group by line
    const grouped: Record<string, typeof ncs> = {};
    for (const nc of ncs) {
      const key = nc.receivingLineId;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(nc);
    }

    return { data: ncs, grouped };
  }

  /**
   * Complete a receiving: validate all lines have quantityReceived set,
   * store signature, calculate discrepancies, update order status.
   */
  static async complete(
    db: DB,
    receivingId: string,
    signatureData: string,
    userId: string,
  ) {
    return await db.transaction(async (tx: DB) => {
      // Get the receiving
      const [receiving] = await tx
        .select()
        .from(receivings)
        .where(
          and(
            eq(receivings.id, receivingId),
            isNull(receivings.deletedAt),
          ),
        );

      if (!receiving) {
        throw Object.assign(new Error('Ricevimento non trovato'), {
          statusCode: 404,
        });
      }

      if (receiving.status !== 'in_progress') {
        throw Object.assign(
          new Error('Il ricevimento e gia completato'),
          { statusCode: 400 },
        );
      }

      // Get all receiving lines
      const lines = await tx
        .select({
          id: receivingLines.id,
          orderLineId: receivingLines.orderLineId,
          productId: receivingLines.productId,
          quantityOrdered: receivingLines.quantityOrdered,
          quantityReceived: receivingLines.quantityReceived,
        })
        .from(receivingLines)
        .where(
          and(
            eq(receivingLines.receivingId, receivingId),
            isNull(receivingLines.deletedAt),
          ),
        );

      // Validate all lines have quantityReceived set
      const incompleteLines = lines.filter(
        (line: any) => line.quantityReceived === null || line.quantityReceived === undefined,
      );

      if (incompleteLines.length > 0) {
        throw Object.assign(
          new Error(
            `${incompleteLines.length} righe non hanno la quantita ricevuta compilata`,
          ),
          { statusCode: 400 },
        );
      }

      // Calculate discrepancies per line
      let hasDiscrepancy = false;
      const discrepancies: Array<{
        lineId: string;
        productId: string;
        ordered: number;
        received: number;
        difference: number;
        discrepancyAmount: number;
      }> = [];

      for (const line of lines) {
        const ordered = parseFloat(line.quantityOrdered || '0');
        const received = parseFloat(line.quantityReceived || '0');
        const difference = ordered - received;

        if (Math.abs(difference) > 0.001) {
          hasDiscrepancy = true;

          // Get unit price from order line
          const [orderLine] = await tx
            .select({ unitPrice: orderLines.unitPrice })
            .from(orderLines)
            .where(eq(orderLines.id, line.orderLineId));

          const unitPrice = parseFloat(orderLine?.unitPrice || '0');
          const discrepancyAmount = difference * unitPrice;

          discrepancies.push({
            lineId: line.id,
            productId: line.productId,
            ordered,
            received,
            difference,
            discrepancyAmount,
          });
        }
      }

      // Update receiving: set completed, store signature
      const [updatedReceiving] = await tx
        .update(receivings)
        .set({
          status: 'completed',
          signatureData,
          updatedAt: new Date(),
        })
        .where(eq(receivings.id, receivingId))
        .returning();

      // Update order status
      const totalOrdered = lines.reduce(
        (sum: number, l: any) => sum + parseFloat(l.quantityOrdered || '0'),
        0,
      );
      const totalReceived = lines.reduce(
        (sum: number, l: any) => sum + parseFloat(l.quantityReceived || '0'),
        0,
      );

      // Determine order status: fully received or partially received
      const orderStatus =
        totalReceived >= totalOrdered * 0.99
          ? 'received'
          : 'partially_received';

      await tx
        .update(purchaseOrders)
        .set({
          status: orderStatus,
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrders.id, receiving.orderId));

      return {
        ...updatedReceiving,
        orderStatus,
        discrepancies,
        totalDiscrepancyAmount: discrepancies.reduce(
          (sum, d) => sum + d.discrepancyAmount,
          0,
        ),
      };
    });
  }

  /**
   * Get expected deliveries for a tenant.
   * Orders with status in (confirmed, in_delivery), grouped by: today, this week, later.
   */
  static async getExpectedDeliveries(db: DB, tenantId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const weekEnd = new Date(todayStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const orders = await db
      .select({
        id: purchaseOrders.id,
        orderNumber: purchaseOrders.orderNumber,
        supplierId: purchaseOrders.supplierId,
        supplierName: suppliers.businessName,
        status: purchaseOrders.status,
        expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
        totalAmount: purchaseOrders.totalAmount,
        isUrgent: purchaseOrders.isUrgent,
        createdAt: purchaseOrders.createdAt,
        linesCount: sql<number>`(
          SELECT COUNT(*)::int FROM order_lines
          WHERE order_lines.order_id = ${purchaseOrders.id}
          AND order_lines.deleted_at IS NULL
        )`.as('lines_count'),
      })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(
        and(
          eq(purchaseOrders.tenantId, tenantId),
          inArray(purchaseOrders.status, ['confirmed', 'in_delivery']),
          isNull(purchaseOrders.deletedAt),
        ),
      )
      .orderBy(purchaseOrders.expectedDeliveryDate);

    // Group by time period
    const today: typeof orders = [];
    const thisWeek: typeof orders = [];
    const later: typeof orders = [];

    for (const order of orders) {
      if (!order.expectedDeliveryDate) {
        later.push(order);
        continue;
      }

      const deliveryDate = new Date(order.expectedDeliveryDate);
      if (deliveryDate < todayEnd) {
        today.push(order);
      } else if (deliveryDate < weekEnd) {
        thisWeek.push(order);
      } else {
        later.push(order);
      }
    }

    return { today, thisWeek, later, total: orders.length };
  }

  /**
   * Get discrepancy report for a tenant.
   * Aggregate: totalOrdered, totalReceived, totalDiscrepancy, bySupplier breakdown.
   */
  static async getDiscrepancyReport(
    db: DB,
    tenantId: string,
    filters: z.infer<typeof discrepancyReportQuerySchema>,
  ) {
    const { period, supplierId } = filters;

    // Calculate date range from period
    const now = new Date();
    let dateFrom: Date;
    switch (period) {
      case 'week':
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case 'quarter':
        dateFrom = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case 'year':
        dateFrom = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      default:
        dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }

    const conditions: any[] = [
      eq(receivings.tenantId, tenantId),
      eq(receivings.status, 'completed'),
      isNull(receivings.deletedAt),
      gte(receivings.receivedAt, dateFrom),
    ];

    if (supplierId) {
      conditions.push(eq(receivings.supplierId, supplierId));
    }

    // Get aggregate data per supplier
    const rows = await db
      .select({
        supplierId: receivings.supplierId,
        supplierName: suppliers.businessName,
        totalOrdered: sql<string>`COALESCE(SUM(${receivingLines.quantityOrdered}::numeric), 0)`,
        totalReceived: sql<string>`COALESCE(SUM(${receivingLines.quantityReceived}::numeric), 0)`,
        receivingCount: sql<number>`COUNT(DISTINCT ${receivings.id})::int`,
        linesCount: sql<number>`COUNT(${receivingLines.id})::int`,
        nonConformitiesCount: sql<number>`(
          SELECT COUNT(*)::int FROM non_conformities nc
          INNER JOIN receiving_lines rl2 ON rl2.id = nc.receiving_line_id
          INNER JOIN receivings r2 ON r2.id = rl2.receiving_id
          WHERE r2.tenant_id = ${tenantId}
          AND r2.received_at >= ${dateFrom}
          AND r2.deleted_at IS NULL
          AND rl2.deleted_at IS NULL
          AND nc.deleted_at IS NULL
          AND r2.supplier_id = ${receivings.supplierId}
        )`.as('nc_count'),
      })
      .from(receivings)
      .innerJoin(
        receivingLines,
        and(
          eq(receivingLines.receivingId, receivings.id),
          isNull(receivingLines.deletedAt),
        ),
      )
      .leftJoin(suppliers, eq(receivings.supplierId, suppliers.id))
      .where(and(...conditions))
      .groupBy(receivings.supplierId, suppliers.businessName);

    // Calculate totals
    let totalOrdered = 0;
    let totalReceived = 0;
    const bySupplier = rows.map((row: any) => {
      const ordered = parseFloat(row.totalOrdered || '0');
      const received = parseFloat(row.totalReceived || '0');
      totalOrdered += ordered;
      totalReceived += received;
      return {
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        totalOrdered: ordered,
        totalReceived: received,
        discrepancy: ordered - received,
        receivingCount: row.receivingCount,
        linesCount: row.linesCount,
        nonConformitiesCount: row.nonConformitiesCount,
      };
    });

    return {
      period,
      dateFrom: dateFrom.toISOString(),
      dateTo: now.toISOString(),
      totalOrdered,
      totalReceived,
      totalDiscrepancy: totalOrdered - totalReceived,
      bySupplier,
    };
  }

  /**
   * Update receiving notes.
   */
  static async updateNotes(db: DB, receivingId: string, notes: string | undefined) {
    const [receiving] = await db
      .select()
      .from(receivings)
      .where(
        and(
          eq(receivings.id, receivingId),
          isNull(receivings.deletedAt),
        ),
      );

    if (!receiving) {
      throw Object.assign(new Error('Ricevimento non trovato'), {
        statusCode: 404,
      });
    }

    const [updated] = await db
      .update(receivings)
      .set({
        notes: notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(receivings.id, receivingId))
      .returning();

    return updated;
  }
}

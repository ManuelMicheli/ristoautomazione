import {
  purchaseOrders,
  orderLines,
  suppliers,
  products,
  supplierProducts,
  auditLog,
  locations,
  users,
} from '@cph/db';
import {
  eq,
  and,
  isNull,
  inArray,
  gte,
  lte,
  desc,
  asc,
  sql,
  count,
} from 'drizzle-orm';
import type { z } from 'zod';
import type {
  createOrderSchema,
  updateOrderSchema,
  addOrderLineSchema,
  updateOrderLineSchema,
  listOrdersQuerySchema,
} from '../routes/orders/schemas';

// Approval threshold in EUR - orders at or above this require manual approval
const APPROVAL_THRESHOLD = 500;

type DB = any; // Drizzle database instance

// Valid status transitions map
const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'approved', 'cancelled'],
  pending_approval: ['approved', 'draft', 'cancelled'],
  approved: ['sent', 'cancelled'],
  sent: ['confirmed'],
  confirmed: ['in_delivery'],
  in_delivery: ['partially_received', 'received'],
  partially_received: ['received'],
  received: ['closed'],
  closed: [],
  cancelled: [],
};

function validateStatusTransition(currentStatus: string, newStatus: string): boolean {
  const allowed = STATUS_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(newStatus) : false;
}

export class OrderService {
  /**
   * List orders with pagination, filtering, and sorting
   */
  static async list(
    db: DB,
    tenantId: string,
    filters: z.infer<typeof listOrdersQuerySchema>,
  ) {
    const {
      page,
      pageSize,
      status,
      supplierId,
      dateFrom,
      dateTo,
      isUrgent,
      sortBy,
      sortDir,
    } = filters;

    const conditions: any[] = [
      eq(purchaseOrders.tenantId, tenantId),
      isNull(purchaseOrders.deletedAt),
    ];

    // Status filter: comma-separated
    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        conditions.push(inArray(purchaseOrders.status, statuses as any));
      }
    }

    if (supplierId) {
      conditions.push(eq(purchaseOrders.supplierId, supplierId));
    }

    if (dateFrom) {
      conditions.push(gte(purchaseOrders.createdAt, new Date(dateFrom)));
    }

    if (dateTo) {
      conditions.push(lte(purchaseOrders.createdAt, new Date(dateTo)));
    }

    if (isUrgent !== undefined) {
      conditions.push(eq(purchaseOrders.isUrgent, isUrgent));
    }

    const whereClause = and(...conditions);

    // Count total
    const [{ total }] = await db
      .select({ total: count() })
      .from(purchaseOrders)
      .where(whereClause);

    // Sort
    const sortColumn =
      sortBy === 'orderNumber'
        ? purchaseOrders.orderNumber
        : sortBy === 'totalAmount'
          ? purchaseOrders.totalAmount
          : purchaseOrders.createdAt;

    const sortFn = sortDir === 'asc' ? asc : desc;

    // Fetch orders with supplier name, creator name, and line count
    const orderRows = await db
      .select({
        id: purchaseOrders.id,
        tenantId: purchaseOrders.tenantId,
        locationId: purchaseOrders.locationId,
        supplierId: purchaseOrders.supplierId,
        supplierName: suppliers.businessName,
        orderNumber: purchaseOrders.orderNumber,
        status: purchaseOrders.status,
        totalAmount: purchaseOrders.totalAmount,
        notes: purchaseOrders.notes,
        approvedBy: purchaseOrders.approvedBy,
        approvedAt: purchaseOrders.approvedAt,
        sentAt: purchaseOrders.sentAt,
        sentVia: purchaseOrders.sentVia,
        expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
        isUrgent: purchaseOrders.isUrgent,
        isRecurringTemplate: purchaseOrders.isRecurringTemplate,
        createdBy: purchaseOrders.createdBy,
        creatorFirstName: users.firstName,
        creatorLastName: users.lastName,
        createdAt: purchaseOrders.createdAt,
        updatedAt: purchaseOrders.updatedAt,
        linesCount: sql<number>`(
          SELECT COUNT(*)::int FROM order_lines
          WHERE order_lines.order_id = ${purchaseOrders.id}
          AND order_lines.deleted_at IS NULL
        )`.as('lines_count'),
      })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .leftJoin(users, eq(purchaseOrders.createdBy, users.id))
      .where(whereClause)
      .orderBy(sortFn(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const orders = orderRows.map((o: any) => ({
      ...o,
      totalAmount: parseFloat(o.totalAmount || '0'),
      createdByName: o.creatorFirstName && o.creatorLastName
        ? `${o.creatorFirstName} ${o.creatorLastName}`
        : o.createdBy,
    }));

    return {
      data: orders,
      pagination: {
        page,
        pageSize,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / pageSize),
      },
    };
  }

  /**
   * Get order by ID with full details: lines, supplier info, status history
   */
  static async getById(db: DB, tenantId: string, orderId: string) {
    // Get order with supplier info
    const [order] = await db
      .select({
        id: purchaseOrders.id,
        tenantId: purchaseOrders.tenantId,
        locationId: purchaseOrders.locationId,
        supplierId: purchaseOrders.supplierId,
        supplierName: suppliers.businessName,
        supplierCategory: suppliers.category,
        locationName: locations.name,
        orderNumber: purchaseOrders.orderNumber,
        status: purchaseOrders.status,
        totalAmount: purchaseOrders.totalAmount,
        notes: purchaseOrders.notes,
        approvedBy: purchaseOrders.approvedBy,
        approvedAt: purchaseOrders.approvedAt,
        sentAt: purchaseOrders.sentAt,
        sentVia: purchaseOrders.sentVia,
        expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
        isUrgent: purchaseOrders.isUrgent,
        isRecurringTemplate: purchaseOrders.isRecurringTemplate,
        createdBy: purchaseOrders.createdBy,
        createdAt: purchaseOrders.createdAt,
        updatedAt: purchaseOrders.updatedAt,
      })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .leftJoin(locations, eq(purchaseOrders.locationId, locations.id))
      .where(
        and(
          eq(purchaseOrders.id, orderId),
          eq(purchaseOrders.tenantId, tenantId),
          isNull(purchaseOrders.deletedAt),
        ),
      );

    if (!order) return null;

    // Get order lines with product info
    const lines = await db
      .select({
        id: orderLines.id,
        orderId: orderLines.orderId,
        productId: orderLines.productId,
        productName: products.name,
        productUnit: products.unit,
        productCategory: products.category,
        supplierProductId: orderLines.supplierProductId,
        quantity: orderLines.quantity,
        unitPrice: orderLines.unitPrice,
        lineTotal: orderLines.lineTotal,
        notes: orderLines.notes,
        createdAt: orderLines.createdAt,
        updatedAt: orderLines.updatedAt,
      })
      .from(orderLines)
      .leftJoin(products, eq(orderLines.productId, products.id))
      .where(
        and(eq(orderLines.orderId, orderId), isNull(orderLines.deletedAt)),
      );

    // Get status history from audit log
    const statusHistory = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        oldValues: auditLog.oldValues,
        newValues: auditLog.newValues,
        userId: auditLog.userId,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityType, 'purchase_order'),
          eq(auditLog.entityId, orderId),
        ),
      )
      .orderBy(desc(auditLog.createdAt));

    return {
      ...order,
      lines,
      statusHistory,
    };
  }

  /**
   * Create a new draft order with lines
   */
  static async create(
    db: DB,
    tenantId: string,
    userId: string,
    data: z.infer<typeof createOrderSchema>,
  ) {
    return await db.transaction(async (tx: DB) => {
      // Determine locationId: use provided or fetch user's default location
      const locationId = data.locationId;

      // If no locationId, get first location for tenant
      let resolvedLocationId = locationId;
      if (!resolvedLocationId) {
        const [loc] = await tx
          .select({ id: locations.id })
          .from(locations)
          .where(
            and(
              eq(locations.tenantId, tenantId),
              isNull(locations.deletedAt),
            ),
          )
          .limit(1);
        if (!loc) {
          throw Object.assign(new Error('Nessuna sede trovata per il tenant'), {
            statusCode: 400,
          });
        }
        resolvedLocationId = loc.id;
      }

      // Insert the order
      const [order] = await tx
        .insert(purchaseOrders)
        .values({
          tenantId,
          locationId: resolvedLocationId,
          supplierId: data.supplierId,
          status: 'draft',
          notes: data.notes || null,
          isUrgent: data.isUrgent ?? false,
          expectedDeliveryDate: data.expectedDeliveryDate || null,
          createdBy: userId,
          totalAmount: '0',
        })
        .returning();

      let totalAmount = 0;
      const insertedLines: any[] = [];

      for (const line of data.lines) {
        // Look up supplierProduct to get the current price
        let spId = line.supplierProductId;
        let unitPrice = '0';

        if (spId) {
          // Fetch directly by supplierProduct ID
          const [sp] = await tx
            .select({
              id: supplierProducts.id,
              currentPrice: supplierProducts.currentPrice,
            })
            .from(supplierProducts)
            .where(
              and(
                eq(supplierProducts.id, spId),
                isNull(supplierProducts.deletedAt),
              ),
            );
          if (sp) {
            unitPrice = sp.currentPrice;
          }
        } else {
          // Look up by supplier + product combination
          const [sp] = await tx
            .select({
              id: supplierProducts.id,
              currentPrice: supplierProducts.currentPrice,
            })
            .from(supplierProducts)
            .where(
              and(
                eq(supplierProducts.supplierId, data.supplierId),
                eq(supplierProducts.productId, line.productId),
                eq(supplierProducts.isActive, true),
                isNull(supplierProducts.deletedAt),
              ),
            );
          if (sp) {
            spId = sp.id;
            unitPrice = sp.currentPrice;
          } else {
            throw Object.assign(
              new Error(
                `Prodotto ${line.productId} non trovato nel catalogo del fornitore`,
              ),
              { statusCode: 400 },
            );
          }
        }

        const lineTotal = (
          parseFloat(unitPrice) * line.quantity
        ).toFixed(2);
        totalAmount += parseFloat(lineTotal);

        const [insertedLine] = await tx
          .insert(orderLines)
          .values({
            orderId: order.id,
            productId: line.productId,
            supplierProductId: spId!,
            quantity: String(line.quantity),
            unitPrice,
            lineTotal,
          })
          .returning();

        insertedLines.push(insertedLine);
      }

      // Update order totalAmount
      await tx
        .update(purchaseOrders)
        .set({
          totalAmount: totalAmount.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrders.id, order.id));

      return {
        ...order,
        totalAmount: totalAmount.toFixed(2),
        lines: insertedLines,
      };
    });
  }

  /**
   * Update a draft order (only allowed in draft status)
   */
  static async update(
    db: DB,
    tenantId: string,
    orderId: string,
    data: z.infer<typeof updateOrderSchema>,
  ) {
    // Check order exists and is draft
    const [order] = await db
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

    if (order.status !== 'draft') {
      throw Object.assign(
        new Error('Solo gli ordini in bozza possono essere modificati'),
        { statusCode: 400 },
      );
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.isUrgent !== undefined) updateData.isUrgent = data.isUrgent;
    if (data.expectedDeliveryDate !== undefined)
      updateData.expectedDeliveryDate = data.expectedDeliveryDate;

    const [updated] = await db
      .update(purchaseOrders)
      .set(updateData)
      .where(eq(purchaseOrders.id, orderId))
      .returning();

    return updated;
  }

  /**
   * Cancel (soft delete) an order. Only if draft or pending_approval.
   */
  static async cancel(db: DB, tenantId: string, orderId: string) {
    const [order] = await db
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

    if (!['draft', 'pending_approval'].includes(order.status)) {
      throw Object.assign(
        new Error(
          'Solo gli ordini in bozza o in attesa di approvazione possono essere annullati',
        ),
        { statusCode: 400 },
      );
    }

    const [cancelled] = await db
      .update(purchaseOrders)
      .set({
        status: 'cancelled',
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, orderId))
      .returning();

    return cancelled;
  }

  /**
   * Add a line to a draft order
   */
  static async addLine(
    db: DB,
    orderId: string,
    data: z.infer<typeof addOrderLineSchema>,
  ) {
    return await db.transaction(async (tx: DB) => {
      // Get order and verify it's draft
      const [order] = await tx
        .select()
        .from(purchaseOrders)
        .where(
          and(eq(purchaseOrders.id, orderId), isNull(purchaseOrders.deletedAt)),
        );

      if (!order) {
        throw Object.assign(new Error('Ordine non trovato'), {
          statusCode: 404,
        });
      }

      if (order.status !== 'draft') {
        throw Object.assign(
          new Error(
            'Le righe possono essere aggiunte solo agli ordini in bozza',
          ),
          { statusCode: 400 },
        );
      }

      // Resolve supplierProduct
      let spId = data.supplierProductId;
      let unitPrice = '0';

      if (spId) {
        const [sp] = await tx
          .select({
            id: supplierProducts.id,
            currentPrice: supplierProducts.currentPrice,
          })
          .from(supplierProducts)
          .where(
            and(
              eq(supplierProducts.id, spId),
              isNull(supplierProducts.deletedAt),
            ),
          );
        if (sp) {
          unitPrice = sp.currentPrice;
        }
      } else {
        const [sp] = await tx
          .select({
            id: supplierProducts.id,
            currentPrice: supplierProducts.currentPrice,
          })
          .from(supplierProducts)
          .where(
            and(
              eq(supplierProducts.supplierId, order.supplierId),
              eq(supplierProducts.productId, data.productId),
              eq(supplierProducts.isActive, true),
              isNull(supplierProducts.deletedAt),
            ),
          );
        if (sp) {
          spId = sp.id;
          unitPrice = sp.currentPrice;
        } else {
          throw Object.assign(
            new Error(
              `Prodotto ${data.productId} non trovato nel catalogo del fornitore`,
            ),
            { statusCode: 400 },
          );
        }
      }

      const lineTotal = (parseFloat(unitPrice) * data.quantity).toFixed(2);

      const [line] = await tx
        .insert(orderLines)
        .values({
          orderId,
          productId: data.productId,
          supplierProductId: spId!,
          quantity: String(data.quantity),
          unitPrice,
          lineTotal,
        })
        .returning();

      // Recalculate order total
      await OrderService.recalculateTotal(tx, orderId);

      return line;
    });
  }

  /**
   * Update a line on a draft order
   */
  static async updateLine(
    db: DB,
    orderId: string,
    lineId: string,
    data: z.infer<typeof updateOrderLineSchema>,
  ) {
    return await db.transaction(async (tx: DB) => {
      // Verify order is draft
      const [order] = await tx
        .select()
        .from(purchaseOrders)
        .where(
          and(eq(purchaseOrders.id, orderId), isNull(purchaseOrders.deletedAt)),
        );

      if (!order) {
        throw Object.assign(new Error('Ordine non trovato'), {
          statusCode: 404,
        });
      }

      if (order.status !== 'draft') {
        throw Object.assign(
          new Error(
            'Le righe possono essere modificate solo negli ordini in bozza',
          ),
          { statusCode: 400 },
        );
      }

      // Get existing line
      const [existingLine] = await tx
        .select()
        .from(orderLines)
        .where(
          and(
            eq(orderLines.id, lineId),
            eq(orderLines.orderId, orderId),
            isNull(orderLines.deletedAt),
          ),
        );

      if (!existingLine) {
        throw Object.assign(new Error('Riga ordine non trovata'), {
          statusCode: 404,
        });
      }

      const updateData: Record<string, any> = { updatedAt: new Date() };

      if (data.quantity !== undefined) {
        const newLineTotal = (
          parseFloat(existingLine.unitPrice) * data.quantity
        ).toFixed(2);
        updateData.quantity = String(data.quantity);
        updateData.lineTotal = newLineTotal;
      }

      if (data.notes !== undefined) {
        updateData.notes = data.notes;
      }

      const [updatedLine] = await tx
        .update(orderLines)
        .set(updateData)
        .where(eq(orderLines.id, lineId))
        .returning();

      // Recalculate order total
      await OrderService.recalculateTotal(tx, orderId);

      return updatedLine;
    });
  }

  /**
   * Remove (soft delete) a line from a draft order
   */
  static async removeLine(db: DB, orderId: string, lineId: string) {
    return await db.transaction(async (tx: DB) => {
      // Verify order is draft
      const [order] = await tx
        .select()
        .from(purchaseOrders)
        .where(
          and(eq(purchaseOrders.id, orderId), isNull(purchaseOrders.deletedAt)),
        );

      if (!order) {
        throw Object.assign(new Error('Ordine non trovato'), {
          statusCode: 404,
        });
      }

      if (order.status !== 'draft') {
        throw Object.assign(
          new Error(
            'Le righe possono essere rimosse solo dagli ordini in bozza',
          ),
          { statusCode: 400 },
        );
      }

      // Soft delete the line
      const [removed] = await tx
        .update(orderLines)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(orderLines.id, lineId),
            eq(orderLines.orderId, orderId),
            isNull(orderLines.deletedAt),
          ),
        )
        .returning();

      if (!removed) {
        throw Object.assign(new Error('Riga ordine non trovata'), {
          statusCode: 404,
        });
      }

      // Recalculate total
      await OrderService.recalculateTotal(tx, orderId);

      return removed;
    });
  }

  /**
   * Submit an order for approval or auto-approve if below threshold
   */
  static async submit(
    db: DB,
    tenantId: string,
    orderId: string,
    userId: string,
  ) {
    const [order] = await db
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

    if (order.status !== 'draft') {
      throw Object.assign(
        new Error('Solo gli ordini in bozza possono essere inviati'),
        { statusCode: 400 },
      );
    }

    // Check if there are lines
    const [{ lineCount }] = await db
      .select({ lineCount: count() })
      .from(orderLines)
      .where(
        and(eq(orderLines.orderId, orderId), isNull(orderLines.deletedAt)),
      );

    if (Number(lineCount) === 0) {
      throw Object.assign(
        new Error("L'ordine deve avere almeno una riga"),
        { statusCode: 400 },
      );
    }

    const total = parseFloat(order.totalAmount || '0');
    let newStatus: string;

    if (total >= APPROVAL_THRESHOLD) {
      newStatus = 'pending_approval';
    } else {
      newStatus = 'approved';
    }

    const updateData: Record<string, any> = {
      status: newStatus,
      updatedAt: new Date(),
    };

    // If auto-approved, set approval fields
    if (newStatus === 'approved') {
      updateData.approvedBy = userId;
      updateData.approvedAt = new Date();
    }

    const [updated] = await db
      .update(purchaseOrders)
      .set(updateData)
      .where(eq(purchaseOrders.id, orderId))
      .returning();

    return { order: updated, newStatus };
  }

  /**
   * Approve a pending order
   */
  static async approve(
    db: DB,
    tenantId: string,
    orderId: string,
    userId: string,
  ) {
    const [order] = await db
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

    if (order.status !== 'pending_approval') {
      throw Object.assign(
        new Error("Solo gli ordini in attesa di approvazione possono essere approvati"),
        { statusCode: 400 },
      );
    }

    const [updated] = await db
      .update(purchaseOrders)
      .set({
        status: 'approved',
        approvedBy: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, orderId))
      .returning();

    return updated;
  }

  /**
   * Reject an order back to draft with reason
   */
  static async reject(
    db: DB,
    tenantId: string,
    orderId: string,
    userId: string,
    reason: string,
  ) {
    const [order] = await db
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

    if (order.status !== 'pending_approval') {
      throw Object.assign(
        new Error(
          'Solo gli ordini in attesa di approvazione possono essere rifiutati',
        ),
        { statusCode: 400 },
      );
    }

    // Append reason to notes
    const existingNotes = order.notes || '';
    const rejectionNote = `[Rifiutato] ${reason}`;
    const updatedNotes = existingNotes
      ? `${existingNotes}\n${rejectionNote}`
      : rejectionNote;

    const [updated] = await db
      .update(purchaseOrders)
      .set({
        status: 'draft',
        notes: updatedNotes,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, orderId))
      .returning();

    return updated;
  }

  /**
   * Mark order as sent (for PDF/email delivery)
   */
  static async send(db: DB, tenantId: string, orderId: string) {
    const [order] = await db
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

    if (order.status !== 'approved') {
      throw Object.assign(
        new Error('Solo gli ordini approvati possono essere inviati al fornitore'),
        { statusCode: 400 },
      );
    }

    const [updated] = await db
      .update(purchaseOrders)
      .set({
        status: 'sent',
        sentAt: new Date(),
        sentVia: 'email',
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, orderId))
      .returning();

    // Return full order data for PDF generation
    const fullOrder = await OrderService.getById(db, tenantId, orderId);
    return fullOrder;
  }

  /**
   * Mark order as confirmed (supplier acknowledged)
   */
  static async confirm(db: DB, orderId: string) {
    const [order] = await db
      .select()
      .from(purchaseOrders)
      .where(
        and(eq(purchaseOrders.id, orderId), isNull(purchaseOrders.deletedAt)),
      );

    if (!order) {
      throw Object.assign(new Error('Ordine non trovato'), {
        statusCode: 404,
      });
    }

    if (order.status !== 'sent') {
      throw Object.assign(
        new Error(
          'Solo gli ordini inviati possono essere confermati',
        ),
        { statusCode: 400 },
      );
    }

    const [updated] = await db
      .update(purchaseOrders)
      .set({ status: 'confirmed', updatedAt: new Date() })
      .where(eq(purchaseOrders.id, orderId))
      .returning();

    return updated;
  }

  /**
   * Mark order as in delivery
   */
  static async markInDelivery(db: DB, orderId: string) {
    const [order] = await db
      .select()
      .from(purchaseOrders)
      .where(
        and(eq(purchaseOrders.id, orderId), isNull(purchaseOrders.deletedAt)),
      );

    if (!order) {
      throw Object.assign(new Error('Ordine non trovato'), {
        statusCode: 404,
      });
    }

    if (order.status !== 'confirmed') {
      throw Object.assign(
        new Error(
          'Solo gli ordini confermati possono essere messi in consegna',
        ),
        { statusCode: 400 },
      );
    }

    const [updated] = await db
      .update(purchaseOrders)
      .set({ status: 'in_delivery', updatedAt: new Date() })
      .where(eq(purchaseOrders.id, orderId))
      .returning();

    return updated;
  }

  /**
   * List recurring templates
   */
  static async listTemplates(db: DB, tenantId: string) {
    const templates = await db
      .select({
        id: purchaseOrders.id,
        tenantId: purchaseOrders.tenantId,
        supplierId: purchaseOrders.supplierId,
        supplierName: suppliers.businessName,
        orderNumber: purchaseOrders.orderNumber,
        totalAmount: purchaseOrders.totalAmount,
        notes: purchaseOrders.notes,
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
          eq(purchaseOrders.isRecurringTemplate, true),
          isNull(purchaseOrders.deletedAt),
        ),
      )
      .orderBy(desc(purchaseOrders.createdAt));

    return templates;
  }

  /**
   * Clone an existing order as a new draft with current prices
   */
  static async cloneOrder(
    db: DB,
    tenantId: string,
    orderId: string,
    userId: string,
  ) {
    return await db.transaction(async (tx: DB) => {
      // Get original order
      const [original] = await tx
        .select()
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.id, orderId),
            eq(purchaseOrders.tenantId, tenantId),
            isNull(purchaseOrders.deletedAt),
          ),
        );

      if (!original) {
        throw Object.assign(new Error('Ordine originale non trovato'), {
          statusCode: 404,
        });
      }

      // Get original lines
      const originalLines = await tx
        .select()
        .from(orderLines)
        .where(
          and(
            eq(orderLines.orderId, orderId),
            isNull(orderLines.deletedAt),
          ),
        );

      // Create new order
      const [newOrder] = await tx
        .insert(purchaseOrders)
        .values({
          tenantId,
          locationId: original.locationId,
          supplierId: original.supplierId,
          status: 'draft',
          notes: original.notes,
          isUrgent: original.isUrgent,
          expectedDeliveryDate: null,
          createdBy: userId,
          totalAmount: '0',
        })
        .returning();

      let totalAmount = 0;
      const newLines: any[] = [];

      for (const line of originalLines) {
        // Look up current price
        let unitPrice = line.unitPrice;

        if (line.supplierProductId) {
          const [sp] = await tx
            .select({ currentPrice: supplierProducts.currentPrice })
            .from(supplierProducts)
            .where(
              and(
                eq(supplierProducts.id, line.supplierProductId),
                isNull(supplierProducts.deletedAt),
              ),
            );
          if (sp) {
            unitPrice = sp.currentPrice;
          }
        }

        const lineTotal = (
          parseFloat(unitPrice) * parseFloat(line.quantity)
        ).toFixed(2);
        totalAmount += parseFloat(lineTotal);

        const [newLine] = await tx
          .insert(orderLines)
          .values({
            orderId: newOrder.id,
            productId: line.productId,
            supplierProductId: line.supplierProductId,
            quantity: line.quantity,
            unitPrice,
            lineTotal,
          })
          .returning();

        newLines.push(newLine);
      }

      // Update total
      await tx
        .update(purchaseOrders)
        .set({
          totalAmount: totalAmount.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrders.id, newOrder.id));

      return {
        ...newOrder,
        totalAmount: totalAmount.toFixed(2),
        lines: newLines,
      };
    });
  }

  /**
   * Save an order as a recurring template
   */
  static async saveAsTemplate(db: DB, orderId: string) {
    const [order] = await db
      .select()
      .from(purchaseOrders)
      .where(
        and(eq(purchaseOrders.id, orderId), isNull(purchaseOrders.deletedAt)),
      );

    if (!order) {
      throw Object.assign(new Error('Ordine non trovato'), {
        statusCode: 404,
      });
    }

    const [updated] = await db
      .update(purchaseOrders)
      .set({
        isRecurringTemplate: true,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, orderId))
      .returning();

    return updated;
  }

  /**
   * Get orders pending approval
   */
  static async getPendingApprovals(db: DB, tenantId: string) {
    const orders = await db
      .select({
        id: purchaseOrders.id,
        tenantId: purchaseOrders.tenantId,
        supplierId: purchaseOrders.supplierId,
        supplierName: suppliers.businessName,
        orderNumber: purchaseOrders.orderNumber,
        totalAmount: purchaseOrders.totalAmount,
        notes: purchaseOrders.notes,
        isUrgent: purchaseOrders.isUrgent,
        createdBy: purchaseOrders.createdBy,
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
          eq(purchaseOrders.status, 'pending_approval'),
          isNull(purchaseOrders.deletedAt),
        ),
      )
      .orderBy(asc(purchaseOrders.createdAt));

    return orders;
  }

  /**
   * Recalculate order total from active lines
   */
  private static async recalculateTotal(tx: DB, orderId: string) {
    const result = await tx
      .select({
        total: sql<string>`COALESCE(SUM(${orderLines.lineTotal}::numeric), 0)`,
      })
      .from(orderLines)
      .where(
        and(eq(orderLines.orderId, orderId), isNull(orderLines.deletedAt)),
      );

    const newTotal = result[0]?.total || '0';

    await tx
      .update(purchaseOrders)
      .set({
        totalAmount: parseFloat(newTotal).toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, orderId));
  }
}

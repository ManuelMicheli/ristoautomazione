import { eq, and, isNull, desc, sql, gte, count } from 'drizzle-orm';
import {
  invoices,
  invoiceLines,
  reconciliations,
  purchaseOrders,
  orderLines,
  receivings,
  receivingLines,
  suppliers,
} from '@cph/db';

type DB = any; // Drizzle database instance

interface DiscrepancyDetail {
  type: 'overcharge' | 'quantity_mismatch' | 'unauthorized_item' | 'missing_item';
  productId?: string;
  description?: string;
  invoiceQuantity?: number;
  orderQuantity?: number;
  receivedQuantity?: number;
  invoiceUnitPrice?: number;
  orderUnitPrice?: number;
  invoiceLineTotal?: number;
  orderLineTotal?: number;
  amount: number;
}

export class ReconciliationService {
  /**
   * THREE-WAY MATCHING: Invoice vs Order vs Receiving.
   *
   * 1. Get invoice with lines
   * 2. Find order (by orderId or by supplier + date proximity)
   * 3. Find receiving (by receivingId or by orderId)
   * 4. Match lines: for each invoice_line, find matching order_line by productId
   * 5. Compare: price (overcharge), quantity (mismatch), unmatched (unauthorized_item)
   * 6. Create reconciliation with discrepancy_details JSONB
   * 7. Return result
   */
  static async reconcile(
    db: DB,
    invoiceId: string,
    orderId?: string,
    receivingId?: string,
  ) {
    return await db.transaction(async (tx: DB) => {
      // 1. Get invoice with lines
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(
          and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)),
        );

      if (!invoice) {
        throw Object.assign(new Error('Fattura non trovata'), { statusCode: 404 });
      }

      const invLines = await tx
        .select()
        .from(invoiceLines)
        .where(
          and(
            eq(invoiceLines.invoiceId, invoiceId),
            isNull(invoiceLines.deletedAt),
          ),
        );

      // 2. Find order
      let resolvedOrderId = orderId;
      if (!resolvedOrderId && invoice.supplierId) {
        // Try to find order by supplier, closest to invoice date
        const [matchedOrder] = await tx
          .select({ id: purchaseOrders.id })
          .from(purchaseOrders)
          .where(
            and(
              eq(purchaseOrders.supplierId, invoice.supplierId),
              eq(purchaseOrders.tenantId, invoice.tenantId),
              isNull(purchaseOrders.deletedAt),
              sql`${purchaseOrders.status} IN ('received', 'partially_received', 'closed')`,
            ),
          )
          .orderBy(desc(purchaseOrders.createdAt))
          .limit(1);

        if (matchedOrder) {
          resolvedOrderId = matchedOrder.id;
        }
      }

      let ordLines: any[] = [];
      if (resolvedOrderId) {
        ordLines = await tx
          .select()
          .from(orderLines)
          .where(
            and(
              eq(orderLines.orderId, resolvedOrderId),
              isNull(orderLines.deletedAt),
            ),
          );
      }

      // 3. Find receiving
      let resolvedReceivingId = receivingId;
      if (!resolvedReceivingId && resolvedOrderId) {
        const [matchedReceiving] = await tx
          .select({ id: receivings.id })
          .from(receivings)
          .where(
            and(
              eq(receivings.orderId, resolvedOrderId),
              eq(receivings.status, 'completed'),
              isNull(receivings.deletedAt),
            ),
          )
          .orderBy(desc(receivings.createdAt))
          .limit(1);

        if (matchedReceiving) {
          resolvedReceivingId = matchedReceiving.id;
        }
      }

      let recvLines: any[] = [];
      if (resolvedReceivingId) {
        recvLines = await tx
          .select()
          .from(receivingLines)
          .where(
            and(
              eq(receivingLines.receivingId, resolvedReceivingId),
              isNull(receivingLines.deletedAt),
            ),
          );
      }

      // 4. Build lookup maps by productId
      const orderLinesByProduct: Record<string, any> = {};
      for (const ol of ordLines) {
        orderLinesByProduct[ol.productId] = ol;
      }

      const receivingLinesByProduct: Record<string, any> = {};
      for (const rl of recvLines) {
        receivingLinesByProduct[rl.productId] = rl;
      }

      // 5. Compare: walk invoice lines and match
      const discrepancies: DiscrepancyDetail[] = [];
      let totalInvoicedAmount = 0;
      let totalOrderAmount = 0;
      let totalReceivedAmount = 0;
      const matchedOrderProductIds = new Set<string>();

      for (const invLine of invLines) {
        const invQty = parseFloat(invLine.quantity || '0');
        const invPrice = parseFloat(invLine.unitPrice || '0');
        const invTotal = parseFloat(invLine.lineTotal || '0') || invQty * invPrice;
        totalInvoicedAmount += invTotal;

        const productId = invLine.productId;
        if (!productId) {
          // Invoice line without product match -- unauthorized item
          discrepancies.push({
            type: 'unauthorized_item',
            description: invLine.description,
            invoiceQuantity: invQty,
            invoiceUnitPrice: invPrice,
            invoiceLineTotal: invTotal,
            amount: invTotal,
          });
          continue;
        }

        matchedOrderProductIds.add(productId);
        const orderLine = orderLinesByProduct[productId];
        const recvLine = receivingLinesByProduct[productId];

        if (!orderLine) {
          // Invoice has a product not in the order
          discrepancies.push({
            type: 'unauthorized_item',
            productId,
            description: invLine.description,
            invoiceQuantity: invQty,
            invoiceUnitPrice: invPrice,
            invoiceLineTotal: invTotal,
            amount: invTotal,
          });
          continue;
        }

        const ordQty = parseFloat(orderLine.quantity || '0');
        const ordPrice = parseFloat(orderLine.unitPrice || '0');
        const ordTotal = parseFloat(orderLine.lineTotal || '0') || ordQty * ordPrice;
        totalOrderAmount += ordTotal;

        const recvQty = recvLine
          ? parseFloat(recvLine.quantityReceived || '0')
          : ordQty;
        totalReceivedAmount += recvQty * ordPrice;

        // Price discrepancy (overcharge)
        if (Math.abs(invPrice - ordPrice) > 0.001) {
          const priceDiff = (invPrice - ordPrice) * invQty;
          discrepancies.push({
            type: 'overcharge',
            productId,
            description: invLine.description,
            invoiceUnitPrice: invPrice,
            orderUnitPrice: ordPrice,
            invoiceQuantity: invQty,
            orderQuantity: ordQty,
            invoiceLineTotal: invTotal,
            orderLineTotal: ordTotal,
            amount: priceDiff,
          });
        }

        // Quantity discrepancy
        if (Math.abs(invQty - ordQty) > 0.001) {
          discrepancies.push({
            type: 'quantity_mismatch',
            productId,
            description: invLine.description,
            invoiceQuantity: invQty,
            orderQuantity: ordQty,
            receivedQuantity: recvQty,
            invoiceLineTotal: invTotal,
            orderLineTotal: ordTotal,
            amount: (invQty - ordQty) * ordPrice,
          });
        }
      }

      // Check for order items missing from invoice
      for (const ol of ordLines) {
        if (!matchedOrderProductIds.has(ol.productId)) {
          const ordQty = parseFloat(ol.quantity || '0');
          const ordPrice = parseFloat(ol.unitPrice || '0');
          const ordTotal = parseFloat(ol.lineTotal || '0') || ordQty * ordPrice;
          totalOrderAmount += ordTotal;

          discrepancies.push({
            type: 'missing_item',
            productId: ol.productId,
            orderQuantity: ordQty,
            orderUnitPrice: ordPrice,
            orderLineTotal: ordTotal,
            amount: -ordTotal, // negative because it is missing from invoice
          });
        }
      }

      // 6. Determine status and total discrepancy
      const totalDiscrepancy = discrepancies.reduce(
        (sum, d) => sum + Math.abs(d.amount),
        0,
      );
      const status = discrepancies.length > 0 ? 'discrepancy' : 'matched';

      // Check for existing reconciliation and soft-delete it
      await tx
        .update(reconciliations)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(reconciliations.invoiceId, invoiceId),
            isNull(reconciliations.deletedAt),
          ),
        );

      // Create new reconciliation
      const [reconciliation] = await tx
        .insert(reconciliations)
        .values({
          invoiceId,
          orderId: resolvedOrderId || null,
          receivingId: resolvedReceivingId || null,
          status,
          totalOrderAmount: String(totalOrderAmount),
          totalReceivedAmount: String(totalReceivedAmount),
          totalInvoicedAmount: String(totalInvoicedAmount),
          discrepancyAmount: String(totalDiscrepancy),
          discrepancyDetails: discrepancies,
        })
        .returning();

      return {
        ...reconciliation,
        discrepancies,
        summary: {
          totalInvoicedAmount,
          totalOrderAmount,
          totalReceivedAmount,
          totalDiscrepancy,
          status,
          discrepancyCount: discrepancies.length,
        },
      };
    });
  }

  /**
   * Get reconciliation for an invoice.
   */
  static async getByInvoiceId(db: DB, invoiceId: string) {
    const [reconciliation] = await db
      .select({
        id: reconciliations.id,
        invoiceId: reconciliations.invoiceId,
        orderId: reconciliations.orderId,
        receivingId: reconciliations.receivingId,
        status: reconciliations.status,
        totalOrderAmount: reconciliations.totalOrderAmount,
        totalReceivedAmount: reconciliations.totalReceivedAmount,
        totalInvoicedAmount: reconciliations.totalInvoicedAmount,
        discrepancyAmount: reconciliations.discrepancyAmount,
        discrepancyDetails: reconciliations.discrepancyDetails,
        notes: reconciliations.notes,
        resolvedBy: reconciliations.resolvedBy,
        resolvedAt: reconciliations.resolvedAt,
        createdAt: reconciliations.createdAt,
        updatedAt: reconciliations.updatedAt,
      })
      .from(reconciliations)
      .where(
        and(
          eq(reconciliations.invoiceId, invoiceId),
          isNull(reconciliations.deletedAt),
        ),
      )
      .orderBy(desc(reconciliations.createdAt))
      .limit(1);

    return reconciliation || null;
  }

  /**
   * Aggregate discrepancies for a tenant over a period, grouped by supplier.
   */
  static async getDiscrepancyReport(
    db: DB,
    tenantId: string,
    period: string = 'month',
    supplierId?: string,
  ) {
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
      eq(invoices.tenantId, tenantId),
      isNull(invoices.deletedAt),
      isNull(reconciliations.deletedAt),
      gte(reconciliations.createdAt, dateFrom),
    ];

    if (supplierId) {
      conditions.push(eq(invoices.supplierId, supplierId));
    }

    const rows = await db
      .select({
        supplierId: invoices.supplierId,
        supplierName: suppliers.businessName,
        totalReconciliations: sql<number>`COUNT(${reconciliations.id})::int`,
        matchedCount: sql<number>`COUNT(CASE WHEN ${reconciliations.status} = 'matched' THEN 1 END)::int`,
        discrepancyCount: sql<number>`COUNT(CASE WHEN ${reconciliations.status} = 'discrepancy' THEN 1 END)::int`,
        totalDiscrepancy: sql<string>`COALESCE(SUM(ABS(${reconciliations.discrepancyAmount}::numeric)), 0)`,
        totalInvoiced: sql<string>`COALESCE(SUM(${reconciliations.totalInvoicedAmount}::numeric), 0)`,
        totalOrdered: sql<string>`COALESCE(SUM(${reconciliations.totalOrderAmount}::numeric), 0)`,
      })
      .from(reconciliations)
      .innerJoin(invoices, eq(reconciliations.invoiceId, invoices.id))
      .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
      .where(and(...conditions))
      .groupBy(invoices.supplierId, suppliers.businessName);

    let grandTotalDiscrepancy = 0;
    let grandTotalInvoiced = 0;
    let grandTotalOrdered = 0;

    const bySupplier = rows.map((row: any) => {
      const disc = parseFloat(row.totalDiscrepancy || '0');
      const invoiced = parseFloat(row.totalInvoiced || '0');
      const ordered = parseFloat(row.totalOrdered || '0');
      grandTotalDiscrepancy += disc;
      grandTotalInvoiced += invoiced;
      grandTotalOrdered += ordered;

      return {
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        totalReconciliations: row.totalReconciliations,
        matchedCount: row.matchedCount,
        discrepancyCount: row.discrepancyCount,
        totalDiscrepancy: disc,
        totalInvoiced: invoiced,
        totalOrdered: ordered,
        discrepancyRate:
          invoiced > 0 ? Math.round((disc / invoiced) * 10000) / 100 : 0,
      };
    });

    return {
      period,
      dateFrom: dateFrom.toISOString(),
      dateTo: now.toISOString(),
      totalDiscrepancy: grandTotalDiscrepancy,
      totalInvoiced: grandTotalInvoiced,
      totalOrdered: grandTotalOrdered,
      discrepancyRate:
        grandTotalInvoiced > 0
          ? Math.round((grandTotalDiscrepancy / grandTotalInvoiced) * 10000) / 100
          : 0,
      bySupplier,
    };
  }
}

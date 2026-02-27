import { eq, and, isNull, desc, sql, gte, lte, count } from 'drizzle-orm';
import {
  invoices,
  invoiceLines,
  suppliers,
  reconciliations,
} from '@cph/db';

type DB = any; // Drizzle database instance

export class InvoiceService {
  /**
   * Paginated list with status/supplier/date filters.
   * Includes supplier name and reconciliation status.
   */
  static async list(
    db: DB,
    tenantId: string,
    filters: {
      page?: number;
      pageSize?: number;
      status?: string;
      supplierId?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;

    const conditions: any[] = [
      eq(invoices.tenantId, tenantId),
      isNull(invoices.deletedAt),
    ];

    if (filters.status) {
      conditions.push(eq(invoices.status, filters.status as any));
    }

    if (filters.supplierId) {
      conditions.push(eq(invoices.supplierId, filters.supplierId));
    }

    if (filters.dateFrom) {
      conditions.push(gte(invoices.invoiceDate, filters.dateFrom));
    }

    if (filters.dateTo) {
      conditions.push(lte(invoices.invoiceDate, filters.dateTo));
    }

    const whereClause = and(...conditions);

    // Count total
    const [{ total }] = await db
      .select({ total: count() })
      .from(invoices)
      .where(whereClause);

    // Fetch invoices with supplier name and reconciliation status
    const rows = await db
      .select({
        id: invoices.id,
        tenantId: invoices.tenantId,
        supplierId: invoices.supplierId,
        supplierName: suppliers.businessName,
        invoiceNumber: invoices.invoiceNumber,
        invoiceDate: invoices.invoiceDate,
        dueDate: invoices.dueDate,
        totalAmount: invoices.totalAmount,
        vatAmount: invoices.vatAmount,
        status: invoices.status,
        ocrProvider: invoices.ocrProvider,
        ocrConfidence: invoices.ocrConfidence,
        verifiedAt: invoices.verifiedAt,
        paidAt: invoices.paidAt,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
        reconciliationStatus: sql<string | null>`(
          SELECT r.status FROM reconciliations r
          WHERE r.invoice_id = ${invoices.id}
          AND r.deleted_at IS NULL
          ORDER BY r.created_at DESC
          LIMIT 1
        )`.as('reconciliation_status'),
      })
      .from(invoices)
      .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
      .where(whereClause)
      .orderBy(desc(invoices.createdAt))
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
   * Upload: create invoice with status=pending_ocr.
   * supplierId is required by the database schema (NOT NULL).
   * If not provided at upload time, caller must supply it.
   */
  static async upload(
    db: DB,
    tenantId: string,
    supplierId: string,
    filePath: string,
    _fileName: string,
    _mimeType: string,
  ) {
    if (!supplierId) {
      throw Object.assign(
        new Error('Il fornitore e obbligatorio per caricare una fattura'),
        { statusCode: 400 },
      );
    }

    const [invoice] = await db
      .insert(invoices)
      .values({
        tenantId,
        supplierId,
        filePath,
        status: 'pending_ocr',
      })
      .returning();

    return invoice;
  }

  /**
   * Get invoice by ID with lines, supplier info, and reconciliation.
   */
  static async getById(db: DB, invoiceId: string) {
    const [invoice] = await db
      .select({
        id: invoices.id,
        tenantId: invoices.tenantId,
        supplierId: invoices.supplierId,
        supplierName: suppliers.businessName,
        invoiceNumber: invoices.invoiceNumber,
        invoiceDate: invoices.invoiceDate,
        dueDate: invoices.dueDate,
        totalAmount: invoices.totalAmount,
        vatAmount: invoices.vatAmount,
        filePath: invoices.filePath,
        ocrProvider: invoices.ocrProvider,
        ocrConfidence: invoices.ocrConfidence,
        status: invoices.status,
        verifiedBy: invoices.verifiedBy,
        verifiedAt: invoices.verifiedAt,
        paidAt: invoices.paidAt,
        paymentReference: invoices.paymentReference,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
      })
      .from(invoices)
      .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
      .where(
        and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)),
      );

    if (!invoice) return null;

    // Get invoice lines
    const lines = await db
      .select()
      .from(invoiceLines)
      .where(
        and(
          eq(invoiceLines.invoiceId, invoiceId),
          isNull(invoiceLines.deletedAt),
        ),
      )
      .orderBy(invoiceLines.createdAt);

    // Get reconciliation if exists
    const [reconciliation] = await db
      .select()
      .from(reconciliations)
      .where(
        and(
          eq(reconciliations.invoiceId, invoiceId),
          isNull(reconciliations.deletedAt),
        ),
      )
      .orderBy(desc(reconciliations.createdAt))
      .limit(1);

    return {
      ...invoice,
      lines,
      reconciliation: reconciliation || null,
    };
  }

  /**
   * Update invoice fields and replace invoice_lines in a transaction.
   */
  static async update(
    db: DB,
    invoiceId: string,
    data: {
      supplierId?: string;
      invoiceNumber?: string;
      invoiceDate?: string;
      dueDate?: string;
      totalAmount?: string;
      vatAmount?: string;
      notes?: string;
      lines?: {
        description?: string;
        productId?: string;
        quantity?: string;
        unitPrice?: string;
        lineTotal?: string;
        vatRate?: string;
      }[];
    },
  ) {
    return await db.transaction(async (tx: DB) => {
      // Update invoice fields
      const updateData: any = { updatedAt: new Date() };
      if (data.supplierId !== undefined) updateData.supplierId = data.supplierId;
      if (data.invoiceNumber !== undefined) updateData.invoiceNumber = data.invoiceNumber;
      if (data.invoiceDate !== undefined) updateData.invoiceDate = data.invoiceDate;
      if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
      if (data.totalAmount !== undefined) updateData.totalAmount = data.totalAmount;
      if (data.vatAmount !== undefined) updateData.vatAmount = data.vatAmount;

      // If currently pending_ocr, move to pending_review
      const [existing] = await tx
        .select({ status: invoices.status })
        .from(invoices)
        .where(eq(invoices.id, invoiceId));

      if (existing?.status === 'pending_ocr') {
        updateData.status = 'pending_review';
      }

      const [updated] = await tx
        .update(invoices)
        .set(updateData)
        .where(eq(invoices.id, invoiceId))
        .returning();

      // Replace invoice lines if provided
      if (data.lines) {
        // Soft-delete old lines
        await tx
          .update(invoiceLines)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(invoiceLines.invoiceId, invoiceId),
              isNull(invoiceLines.deletedAt),
            ),
          );

        // Insert new lines
        if (data.lines.length > 0) {
          await tx.insert(invoiceLines).values(
            data.lines.map((line) => ({
              invoiceId,
              description: line.description || null,
              productId: line.productId || null,
              quantity: line.quantity || null,
              unitPrice: line.unitPrice || null,
              lineTotal: line.lineTotal || null,
              vatRate: line.vatRate || null,
            })),
          );
        }
      }

      return updated;
    });
  }

  /**
   * Set status=verified, verified_by, verified_at.
   */
  static async verify(db: DB, invoiceId: string, userId: string) {
    const [invoice] = await db
      .select({ status: invoices.status })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)));

    if (!invoice) {
      throw Object.assign(new Error('Fattura non trovata'), { statusCode: 404 });
    }

    if (invoice.status !== 'pending_review') {
      throw Object.assign(
        new Error('La fattura deve essere in stato "in attesa di revisione" per essere verificata'),
        { statusCode: 400 },
      );
    }

    const [updated] = await db
      .update(invoices)
      .set({
        status: 'verified',
        verifiedBy: userId,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    return updated;
  }

  /**
   * Set status=contested, add notes.
   */
  static async contest(db: DB, invoiceId: string, notes: string) {
    const [invoice] = await db
      .select({ status: invoices.status })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)));

    if (!invoice) {
      throw Object.assign(new Error('Fattura non trovata'), { statusCode: 404 });
    }

    const allowedStatuses = ['pending_review', 'verified'];
    if (!allowedStatuses.includes(invoice.status)) {
      throw Object.assign(
        new Error('La fattura non puo essere contestata nello stato attuale'),
        { statusCode: 400 },
      );
    }

    const [updated] = await db
      .update(invoices)
      .set({
        status: 'contested',
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    // Store contest notes in reconciliation if exists, otherwise just return
    // Notes are tracked via audit log in the route handler
    return updated;
  }

  /**
   * Set status=approved.
   */
  static async approvePayment(db: DB, invoiceId: string) {
    const [invoice] = await db
      .select({ status: invoices.status })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)));

    if (!invoice) {
      throw Object.assign(new Error('Fattura non trovata'), { statusCode: 404 });
    }

    if (invoice.status !== 'verified') {
      throw Object.assign(
        new Error('La fattura deve essere verificata prima di approvare il pagamento'),
        { statusCode: 400 },
      );
    }

    const [updated] = await db
      .update(invoices)
      .set({
        status: 'approved',
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    return updated;
  }

  /**
   * Set status=paid, paid_at=now, payment_reference.
   */
  static async markPaid(db: DB, invoiceId: string, paymentReference: string) {
    const [invoice] = await db
      .select({ status: invoices.status })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)));

    if (!invoice) {
      throw Object.assign(new Error('Fattura non trovata'), { statusCode: 404 });
    }

    if (invoice.status !== 'approved') {
      throw Object.assign(
        new Error('La fattura deve essere approvata prima di segnarla come pagata'),
        { statusCode: 400 },
      );
    }

    const [updated] = await db
      .update(invoices)
      .set({
        status: 'paid',
        paidAt: new Date(),
        paymentReference,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    return updated;
  }

  /**
   * Get payment schedule: invoices with status verified/approved grouped by week.
   * Flags overdue invoices (dueDate < now and not paid).
   */
  static async getPaymentSchedule(
    db: DB,
    tenantId: string,
    weeksAhead: number = 8,
  ) {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + weeksAhead * 7);

    const rows = await db
      .select({
        id: invoices.id,
        supplierId: invoices.supplierId,
        supplierName: suppliers.businessName,
        invoiceNumber: invoices.invoiceNumber,
        totalAmount: invoices.totalAmount,
        dueDate: invoices.dueDate,
        status: invoices.status,
      })
      .from(invoices)
      .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          isNull(invoices.deletedAt),
          sql`${invoices.status} IN ('verified', 'approved')`,
        ),
      )
      .orderBy(invoices.dueDate);

    // Group by week
    const weeks: Record<
      string,
      {
        weekStart: string;
        weekEnd: string;
        invoices: any[];
        total: number;
        overdueCount: number;
      }
    > = {};

    const overdue: any[] = [];

    for (const row of rows) {
      const isOverdue =
        row.dueDate && new Date(row.dueDate) < now;

      if (isOverdue) {
        overdue.push({ ...row, isOverdue: true });
        continue;
      }

      if (!row.dueDate) continue;

      const dueDate = new Date(row.dueDate);
      // Get ISO week start (Monday)
      const weekStart = new Date(dueDate);
      const day = weekStart.getDay();
      const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
      weekStart.setDate(diff);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const key = weekStart.toISOString().split('T')[0]!;

      if (!weeks[key]) {
        weeks[key] = {
          weekStart: weekStart.toISOString().split('T')[0]!,
          weekEnd: weekEnd.toISOString().split('T')[0]!,
          invoices: [],
          total: 0,
          overdueCount: 0,
        };
      }

      weeks[key]!.invoices.push(row);
      weeks[key]!.total += parseFloat(row.totalAmount || '0');
    }

    return {
      overdue,
      overdueTotal: overdue.reduce(
        (sum, inv) => sum + parseFloat(inv.totalAmount || '0'),
        0,
      ),
      weeks: Object.values(weeks),
      grandTotal:
        Object.values(weeks).reduce((sum, w) => sum + w.total, 0) +
        overdue.reduce((sum, inv) => sum + parseFloat(inv.totalAmount || '0'), 0),
    };
  }

  /**
   * Aggregate discrepancies from reconciliations:
   * total discrepancy, by type, by supplier.
   */
  static async getDiscrepancyReport(
    db: DB,
    tenantId: string,
    period: string = 'month',
    supplierId?: string,
  ) {
    // Calculate date range
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
      eq(reconciliations.status, 'discrepancy'),
    ];

    if (supplierId) {
      conditions.push(eq(invoices.supplierId, supplierId));
    }

    const rows = await db
      .select({
        supplierId: invoices.supplierId,
        supplierName: suppliers.businessName,
        reconciliationCount: sql<number>`COUNT(${reconciliations.id})::int`,
        totalDiscrepancy: sql<string>`COALESCE(SUM(ABS(${reconciliations.discrepancyAmount}::numeric)), 0)`,
        totalOrderAmount: sql<string>`COALESCE(SUM(${reconciliations.totalOrderAmount}::numeric), 0)`,
        totalInvoicedAmount: sql<string>`COALESCE(SUM(${reconciliations.totalInvoicedAmount}::numeric), 0)`,
      })
      .from(reconciliations)
      .innerJoin(invoices, eq(reconciliations.invoiceId, invoices.id))
      .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
      .where(and(...conditions))
      .groupBy(invoices.supplierId, suppliers.businessName);

    let totalDiscrepancy = 0;
    let totalOrdered = 0;
    let totalInvoiced = 0;

    const bySupplier = rows.map((row: any) => {
      const disc = parseFloat(row.totalDiscrepancy || '0');
      const ordered = parseFloat(row.totalOrderAmount || '0');
      const invoiced = parseFloat(row.totalInvoicedAmount || '0');
      totalDiscrepancy += disc;
      totalOrdered += ordered;
      totalInvoiced += invoiced;
      return {
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        reconciliationCount: row.reconciliationCount,
        totalDiscrepancy: disc,
        totalOrderAmount: ordered,
        totalInvoicedAmount: invoiced,
      };
    });

    return {
      period,
      dateFrom: dateFrom.toISOString(),
      dateTo: now.toISOString(),
      totalDiscrepancy,
      totalOrdered,
      totalInvoiced,
      bySupplier,
    };
  }
}

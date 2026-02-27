import {
  eq,
  and,
  isNull,
  ilike,
  sql,
  desc,
  asc,
  count,
  or,
  gte,
  SQL,
} from 'drizzle-orm';
import {
  suppliers,
  supplierContacts,
  supplierDocuments,
  supplierProducts,
  purchaseOrders,
  auditLog,
} from '@cph/db';
import type { FastifyInstance } from 'fastify';

type Db = FastifyInstance['db'];

export interface ListSuppliersFilters {
  page?: number;
  pageSize?: number;
  q?: string;
  category?: string;
  sortBy?: 'businessName' | 'createdAt' | 'category';
  sortDir?: 'asc' | 'desc';
}

export class SupplierService {
  // ---------------------------------------------------------------------------
  // LIST — paginated list with search, filter, sort
  // ---------------------------------------------------------------------------
  async list(db: Db, tenantId: string, filters: ListSuppliersFilters) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const q = filters.q;
    const category = filters.category;
    const sortBy = filters.sortBy ?? 'businessName';
    const sortDir = filters.sortDir ?? 'asc';
    const offset = (page - 1) * pageSize;

    // Build WHERE conditions
    const conditions: SQL[] = [
      eq(suppliers.tenantId, tenantId),
      isNull(suppliers.deletedAt),
    ];

    if (q) {
      conditions.push(
        or(
          ilike(suppliers.businessName, `%${q}%`),
          ilike(suppliers.vatNumber, `%${q}%`),
        )!,
      );
    }

    if (category) {
      conditions.push(eq(suppliers.category, category as any));
    }

    const whereClause = and(...conditions)!;

    // Count total
    const countResult = await db
      .select({ total: count() })
      .from(suppliers)
      .where(whereClause);
    const total = countResult[0]!.total;

    // Sort column mapping
    const sortColumn =
      sortBy === 'businessName'
        ? suppliers.businessName
        : sortBy === 'createdAt'
          ? suppliers.createdAt
          : suppliers.category;

    const orderFn = sortDir === 'desc' ? desc : asc;

    // Fetch suppliers
    const rows = await db
      .select({
        id: suppliers.id,
        tenantId: suppliers.tenantId,
        businessName: suppliers.businessName,
        vatNumber: suppliers.vatNumber,
        paymentTerms: suppliers.paymentTerms,
        deliveryDays: suppliers.deliveryDays,
        leadTimeDays: suppliers.leadTimeDays,
        minimumOrderAmount: suppliers.minimumOrderAmount,
        notes: suppliers.notes,
        category: suppliers.category,
        scoreData: suppliers.scoreData,
        createdAt: suppliers.createdAt,
        updatedAt: suppliers.updatedAt,
      })
      .from(suppliers)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset(offset);

    // Enrich with contacts count and products count for each supplier
    const supplierIds = rows.map((r) => r.id);

    let contactCounts: Record<string, number> = {};
    let productCounts: Record<string, number> = {};
    let lastOrderDates: Record<string, string | null> = {};

    if (supplierIds.length > 0) {
      // Contacts count per supplier
      const contactRows = await db
        .select({
          supplierId: supplierContacts.supplierId,
          count: count(),
        })
        .from(supplierContacts)
        .where(
          and(
            sql`${supplierContacts.supplierId} IN (${sql.join(
              supplierIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
            isNull(supplierContacts.deletedAt),
          ),
        )
        .groupBy(supplierContacts.supplierId);

      for (const row of contactRows) {
        contactCounts[row.supplierId] = row.count;
      }

      // Products count per supplier
      const productRows = await db
        .select({
          supplierId: supplierProducts.supplierId,
          count: count(),
        })
        .from(supplierProducts)
        .where(
          and(
            sql`${supplierProducts.supplierId} IN (${sql.join(
              supplierIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
            isNull(supplierProducts.deletedAt),
          ),
        )
        .groupBy(supplierProducts.supplierId);

      for (const row of productRows) {
        productCounts[row.supplierId] = row.count;
      }

      // Last order date per supplier
      const orderRows = await db
        .select({
          supplierId: purchaseOrders.supplierId,
          lastOrderDate: sql<string>`MAX(${purchaseOrders.createdAt})`.as(
            'last_order_date',
          ),
        })
        .from(purchaseOrders)
        .where(
          and(
            sql`${purchaseOrders.supplierId} IN (${sql.join(
              supplierIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
            isNull(purchaseOrders.deletedAt),
          ),
        )
        .groupBy(purchaseOrders.supplierId);

      for (const row of orderRows) {
        lastOrderDates[row.supplierId] = row.lastOrderDate;
      }
    }

    const data = rows.map((row) => {
      // Extract numeric score from scoreData JSON
      const sd = row.scoreData as any;
      const score: number | null =
        sd && typeof sd === 'object' && typeof sd.overall === 'number'
          ? sd.overall
          : sd && typeof sd === 'number'
            ? sd
            : null;

      return {
        ...row,
        score,
        contactsCount: contactCounts[row.id] || 0,
        activeProducts: productCounts[row.id] || 0,
        lastOrderDate: lastOrderDates[row.id] || null,
      };
    });

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // GET BY ID — full detail with contacts, documents, orders, spend
  // ---------------------------------------------------------------------------
  async getById(db: Db, tenantId: string, supplierId: string) {
    // Fetch supplier
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.id, supplierId),
          eq(suppliers.tenantId, tenantId),
          isNull(suppliers.deletedAt),
        ),
      )
      .limit(1);

    if (!supplier) return null;

    // Contacts
    const contacts = await db
      .select()
      .from(supplierContacts)
      .where(
        and(
          eq(supplierContacts.supplierId, supplierId),
          isNull(supplierContacts.deletedAt),
        ),
      )
      .orderBy(desc(supplierContacts.isPrimary), asc(supplierContacts.name));

    // Documents with computed expiry status
    const documents = await db
      .select()
      .from(supplierDocuments)
      .where(
        and(
          eq(supplierDocuments.supplierId, supplierId),
          isNull(supplierDocuments.deletedAt),
        ),
      )
      .orderBy(desc(supplierDocuments.createdAt));

    const now = new Date();
    const thirtyDaysFromNow = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    const documentsWithStatus = documents.map((doc) => {
      let expiryStatus: 'valid' | 'expiring_soon' | 'expired' = 'valid';
      if (doc.expiryDate) {
        const expiry = new Date(doc.expiryDate);
        if (expiry < now) {
          expiryStatus = 'expired';
        } else if (expiry < thirtyDaysFromNow) {
          expiryStatus = 'expiring_soon';
        }
      }
      return { ...doc, expiryStatus };
    });

    // Recent 5 orders
    const recentOrders = await db
      .select({
        id: purchaseOrders.id,
        orderNumber: purchaseOrders.orderNumber,
        status: purchaseOrders.status,
        totalAmount: purchaseOrders.totalAmount,
        createdAt: purchaseOrders.createdAt,
        expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.supplierId, supplierId),
          eq(purchaseOrders.tenantId, tenantId),
          isNull(purchaseOrders.deletedAt),
        ),
      )
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(5);

    // Products count
    const [productsResult] = await db
      .select({ count: count() })
      .from(supplierProducts)
      .where(
        and(
          eq(supplierProducts.supplierId, supplierId),
          isNull(supplierProducts.deletedAt),
        ),
      );

    // Total spend in last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const [spendResult] = await db
      .select({
        totalSpend:
          sql<string>`COALESCE(SUM(${purchaseOrders.totalAmount}::numeric), 0)`.as(
            'total_spend',
          ),
        orderCount: count(),
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.supplierId, supplierId),
          eq(purchaseOrders.tenantId, tenantId),
          isNull(purchaseOrders.deletedAt),
          gte(purchaseOrders.createdAt, twelveMonthsAgo),
        ),
      );

    return {
      ...supplier,
      contacts,
      documents: documentsWithStatus,
      recentOrders,
      productsCount: productsResult?.count || 0,
      totalSpend12Months: parseFloat(spendResult?.totalSpend || '0'),
      orderCount12Months: spendResult?.orderCount || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // CREATE — insert supplier + contacts in a transaction
  // ---------------------------------------------------------------------------
  async create(
    db: Db,
    tenantId: string,
    data: {
      businessName?: string;
      vatNumber?: string;
      paymentTerms?: string;
      deliveryDays?: number[];
      leadTimeDays?: number;
      minimumOrderAmount?: number;
      notes?: string;
      category?: string;
      contacts?: Array<{
        name?: string;
        role?: string;
        phone?: string;
        email?: string;
        isPrimary?: boolean;
      }>;
    },
  ) {
    const { contacts, ...supplierData } = data;

    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(suppliers)
        .values({
          tenantId,
          businessName: supplierData.businessName!,
          vatNumber: supplierData.vatNumber || null,
          paymentTerms: supplierData.paymentTerms || null,
          deliveryDays: supplierData.deliveryDays || [],
          leadTimeDays: supplierData.leadTimeDays || null,
          minimumOrderAmount: supplierData.minimumOrderAmount
            ? String(supplierData.minimumOrderAmount)
            : null,
          notes: supplierData.notes || null,
          category: (supplierData.category as any) || null,
        })
        .returning();

      // Insert contacts
      if (contacts && contacts.length > 0) {
        await tx.insert(supplierContacts).values(
          contacts.map((c) => ({
            supplierId: created!.id,
            name: c.name!,
            role: c.role || null,
            phone: c.phone || null,
            email: c.email || null,
            isPrimary: c.isPrimary ?? false,
          })),
        );
      }

      return created;
    });

    return result;
  }

  // ---------------------------------------------------------------------------
  // UPDATE — update supplier fields
  // ---------------------------------------------------------------------------
  async update(
    db: Db,
    tenantId: string,
    supplierId: string,
    data: {
      businessName?: string;
      vatNumber?: string;
      paymentTerms?: string;
      deliveryDays?: number[];
      leadTimeDays?: number;
      minimumOrderAmount?: number;
      notes?: string;
      category?: string;
    },
  ) {
    const updateValues: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (data.businessName !== undefined)
      updateValues.businessName = data.businessName;
    if (data.vatNumber !== undefined)
      updateValues.vatNumber = data.vatNumber || null;
    if (data.paymentTerms !== undefined)
      updateValues.paymentTerms = data.paymentTerms || null;
    if (data.deliveryDays !== undefined)
      updateValues.deliveryDays = data.deliveryDays;
    if (data.leadTimeDays !== undefined)
      updateValues.leadTimeDays = data.leadTimeDays;
    if (data.minimumOrderAmount !== undefined)
      updateValues.minimumOrderAmount =
        data.minimumOrderAmount !== undefined
          ? String(data.minimumOrderAmount)
          : null;
    if (data.notes !== undefined) updateValues.notes = data.notes || null;
    if (data.category !== undefined)
      updateValues.category = (data.category as any) || null;

    const [updated] = await db
      .update(suppliers)
      .set(updateValues)
      .where(
        and(
          eq(suppliers.id, supplierId),
          eq(suppliers.tenantId, tenantId),
          isNull(suppliers.deletedAt),
        ),
      )
      .returning();

    return updated || null;
  }

  // ---------------------------------------------------------------------------
  // SOFT DELETE
  // ---------------------------------------------------------------------------
  async softDelete(db: Db, tenantId: string, supplierId: string) {
    const [deleted] = await db
      .update(suppliers)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(suppliers.id, supplierId),
          eq(suppliers.tenantId, tenantId),
          isNull(suppliers.deletedAt),
        ),
      )
      .returning();

    return deleted || null;
  }

  // ---------------------------------------------------------------------------
  // CONTACTS
  // ---------------------------------------------------------------------------
  async listContacts(db: Db, supplierId: string) {
    return db
      .select()
      .from(supplierContacts)
      .where(
        and(
          eq(supplierContacts.supplierId, supplierId),
          isNull(supplierContacts.deletedAt),
        ),
      )
      .orderBy(desc(supplierContacts.isPrimary), asc(supplierContacts.name));
  }

  async createContact(
    db: Db,
    supplierId: string,
    data: {
      name: string;
      role?: string;
      phone?: string;
      email?: string;
      isPrimary?: boolean;
    },
  ) {
    const [contact] = await db
      .insert(supplierContacts)
      .values({
        supplierId,
        name: data.name,
        role: data.role || null,
        phone: data.phone || null,
        email: data.email || null,
        isPrimary: data.isPrimary ?? false,
      })
      .returning();

    return contact;
  }

  async updateContact(
    db: Db,
    contactId: string,
    data: {
      name?: string;
      role?: string;
      phone?: string;
      email?: string;
      isPrimary?: boolean;
    },
  ) {
    const updateValues: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) updateValues.name = data.name;
    if (data.role !== undefined) updateValues.role = data.role || null;
    if (data.phone !== undefined) updateValues.phone = data.phone || null;
    if (data.email !== undefined) updateValues.email = data.email || null;
    if (data.isPrimary !== undefined) updateValues.isPrimary = data.isPrimary;

    const [updated] = await db
      .update(supplierContacts)
      .set(updateValues)
      .where(
        and(
          eq(supplierContacts.id, contactId),
          isNull(supplierContacts.deletedAt),
        ),
      )
      .returning();

    return updated || null;
  }

  async deleteContact(db: Db, contactId: string) {
    const [deleted] = await db
      .update(supplierContacts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(supplierContacts.id, contactId),
          isNull(supplierContacts.deletedAt),
        ),
      )
      .returning();

    return deleted || null;
  }

  // ---------------------------------------------------------------------------
  // DOCUMENTS
  // ---------------------------------------------------------------------------
  async listDocuments(db: Db, supplierId: string) {
    const documents = await db
      .select()
      .from(supplierDocuments)
      .where(
        and(
          eq(supplierDocuments.supplierId, supplierId),
          isNull(supplierDocuments.deletedAt),
        ),
      )
      .orderBy(desc(supplierDocuments.createdAt));

    const now = new Date();
    const thirtyDaysFromNow = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    return documents.map((doc) => {
      let expiryStatus: 'valid' | 'expiring_soon' | 'expired' = 'valid';
      if (doc.expiryDate) {
        const expiry = new Date(doc.expiryDate);
        if (expiry < now) {
          expiryStatus = 'expired';
        } else if (expiry < thirtyDaysFromNow) {
          expiryStatus = 'expiring_soon';
        }
      }
      return { ...doc, expiryStatus };
    });
  }

  async createDocument(
    db: Db,
    supplierId: string,
    data: {
      type: string;
      filePath: string;
      fileName: string;
      mimeType: string;
      expiryDate?: string | null;
      uploadedBy: string;
    },
  ) {
    const [doc] = await db
      .insert(supplierDocuments)
      .values({
        supplierId,
        type: data.type as any,
        filePath: data.filePath,
        fileName: data.fileName,
        mimeType: data.mimeType,
        expiryDate: data.expiryDate || null,
        uploadedBy: data.uploadedBy,
      })
      .returning();

    return doc;
  }

  async deleteDocument(db: Db, docId: string) {
    const [deleted] = await db
      .update(supplierDocuments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(supplierDocuments.id, docId),
          isNull(supplierDocuments.deletedAt),
        ),
      )
      .returning();

    return deleted || null;
  }

  // ---------------------------------------------------------------------------
  // HISTORY — query audit_log for entity
  // ---------------------------------------------------------------------------
  async getHistory(
    db: Db,
    entityId: string,
    page: number = 1,
    pageSize: number = 20,
  ) {
    const offset = (page - 1) * pageSize;

    const auditCountResult = await db
      .select({ total: count() })
      .from(auditLog)
      .where(eq(auditLog.entityId, entityId));
    const total = auditCountResult[0]!.total;

    const data = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, entityId))
      .orderBy(desc(auditLog.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // CATEGORIES — list categories with count
  // ---------------------------------------------------------------------------
  async getCategories(db: Db, tenantId: string) {
    const rows = await db
      .select({
        category: suppliers.category,
        count: count(),
      })
      .from(suppliers)
      .where(
        and(eq(suppliers.tenantId, tenantId), isNull(suppliers.deletedAt)),
      )
      .groupBy(suppliers.category)
      .orderBy(desc(count()));

    return rows.map((row) => ({
      category: row.category || 'uncategorized',
      count: row.count,
    }));
  }

  // ---------------------------------------------------------------------------
  // RISK MAP — categories with supplier count and risk flag
  // ---------------------------------------------------------------------------
  async getRiskMap(db: Db, tenantId: string) {
    // Get all categories with counts
    const categories = await this.getCategories(db, tenantId);

    // For each category, check if there is a single-supplier dependency (risk)
    const riskMap = await Promise.all(
      categories.map(async (cat) => {
        // A category is "at risk" if it has only 1 supplier
        const isAtRisk = cat.count <= 1;

        // Check for document expiry risks
        let expiringDocsCount = 0;
        if (cat.category !== 'uncategorized') {
          const thirtyDaysFromNow = new Date();
          thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

          const [result] = await db
            .select({ count: count() })
            .from(supplierDocuments)
            .innerJoin(suppliers, eq(supplierDocuments.supplierId, suppliers.id))
            .where(
              and(
                eq(suppliers.tenantId, tenantId),
                eq(suppliers.category, cat.category as any),
                isNull(suppliers.deletedAt),
                isNull(supplierDocuments.deletedAt),
                sql`${supplierDocuments.expiryDate} IS NOT NULL`,
                sql`${supplierDocuments.expiryDate}::date <= ${thirtyDaysFromNow.toISOString().split('T')[0]}`,
              ),
            );

          expiringDocsCount = result?.count || 0;
        }

        return {
          category: cat.category,
          supplierCount: cat.count,
          singleSupplierRisk: isAtRisk,
          expiringDocuments: expiringDocsCount,
          riskLevel:
            isAtRisk && expiringDocsCount > 0
              ? 'high'
              : isAtRisk || expiringDocsCount > 0
                ? 'medium'
                : 'low',
        };
      }),
    );

    return riskMap;
  }
}

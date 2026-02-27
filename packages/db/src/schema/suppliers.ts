import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  date,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { supplierCategoryEnum, supplierDocumentTypeEnum } from './enums';
import { tenants } from './tenants';
import { users } from './users';

// ---------------------------------------------------------------------------
// suppliers
// ---------------------------------------------------------------------------
export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    businessName: text('business_name').notNull(),
    vatNumber: text('vat_number'),
    paymentTerms: text('payment_terms'),
    deliveryDays: jsonb('delivery_days').default([]),
    leadTimeDays: integer('lead_time_days'),
    minimumOrderAmount: numeric('minimum_order_amount', {
      precision: 10,
      scale: 2,
    }),
    notes: text('notes'),
    category: supplierCategoryEnum('category'),
    scoreData: jsonb('score_data'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_suppliers_tenant_id').on(table.tenantId),
    index('idx_suppliers_tenant_deleted').on(table.tenantId, table.deletedAt),
  ],
);

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [suppliers.tenantId],
    references: [tenants.id],
  }),
  contacts: many(supplierContacts),
  documents: many(supplierDocuments),
}));

// ---------------------------------------------------------------------------
// supplier_contacts
// ---------------------------------------------------------------------------
export const supplierContacts = pgTable(
  'supplier_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role'),
    phone: text('phone'),
    email: text('email'),
    isPrimary: boolean('is_primary').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_supplier_contacts_supplier_id').on(table.supplierId),
    index('idx_supplier_contacts_supplier_deleted').on(
      table.supplierId,
      table.deletedAt,
    ),
  ],
);

export const supplierContactsRelations = relations(
  supplierContacts,
  ({ one }) => ({
    supplier: one(suppliers, {
      fields: [supplierContacts.supplierId],
      references: [suppliers.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// supplier_documents
// ---------------------------------------------------------------------------
export const supplierDocuments = pgTable(
  'supplier_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    type: supplierDocumentTypeEnum('type').notNull(),
    filePath: text('file_path').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type'),
    expiryDate: date('expiry_date'),
    uploadedBy: uuid('uploaded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_supplier_documents_supplier_id').on(table.supplierId),
    index('idx_supplier_documents_uploaded_by').on(table.uploadedBy),
    index('idx_supplier_documents_supplier_deleted').on(
      table.supplierId,
      table.deletedAt,
    ),
  ],
);

export const supplierDocumentsRelations = relations(
  supplierDocuments,
  ({ one }) => ({
    supplier: one(suppliers, {
      fields: [supplierDocuments.supplierId],
      references: [suppliers.id],
    }),
    uploader: one(users, {
      fields: [supplierDocuments.uploadedBy],
      references: [users.id],
    }),
  }),
);

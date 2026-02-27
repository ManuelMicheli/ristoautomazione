import {
  pgTable,
  uuid,
  text,
  numeric,
  date,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import {
  invoiceStatusEnum,
  ocrProviderEnum,
  reconciliationStatusEnum,
} from './enums';
import { tenants } from './tenants';
import { suppliers } from './suppliers';
import { products } from './products';
import { purchaseOrders } from './orders';
import { receivings } from './receivings';
import { users } from './users';

// ---------------------------------------------------------------------------
// invoices
// ---------------------------------------------------------------------------
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    invoiceNumber: text('invoice_number'),
    invoiceDate: date('invoice_date'),
    dueDate: date('due_date'),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }),
    vatAmount: numeric('vat_amount', { precision: 12, scale: 2 }),
    filePath: text('file_path'),
    ocrProvider: ocrProviderEnum('ocr_provider'),
    ocrConfidence: numeric('ocr_confidence', { precision: 5, scale: 2 }),
    status: invoiceStatusEnum('status').default('pending_ocr').notNull(),
    verifiedBy: uuid('verified_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paymentReference: text('payment_reference'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_invoices_tenant_id').on(table.tenantId),
    index('idx_invoices_supplier_id').on(table.supplierId),
    index('idx_invoices_verified_by').on(table.verifiedBy),
    index('idx_invoices_tenant_deleted').on(table.tenantId, table.deletedAt),
  ],
);

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [invoices.tenantId],
    references: [tenants.id],
  }),
  supplier: one(suppliers, {
    fields: [invoices.supplierId],
    references: [suppliers.id],
  }),
  verifier: one(users, {
    fields: [invoices.verifiedBy],
    references: [users.id],
  }),
  lines: many(invoiceLines),
  reconciliations: many(reconciliations),
}));

// ---------------------------------------------------------------------------
// invoice_lines
// ---------------------------------------------------------------------------
export const invoiceLines = pgTable(
  'invoice_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    description: text('description'),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    quantity: numeric('quantity', { precision: 10, scale: 3 }),
    unitPrice: numeric('unit_price', { precision: 10, scale: 4 }),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }),
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_invoice_lines_invoice_id').on(table.invoiceId),
    index('idx_invoice_lines_product_id').on(table.productId),
  ],
);

export const invoiceLinesRelations = relations(invoiceLines, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceLines.invoiceId],
    references: [invoices.id],
  }),
  product: one(products, {
    fields: [invoiceLines.productId],
    references: [products.id],
  }),
}));

// ---------------------------------------------------------------------------
// reconciliations
// ---------------------------------------------------------------------------
export const reconciliations = pgTable(
  'reconciliations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').references(() => purchaseOrders.id, {
      onDelete: 'set null',
    }),
    receivingId: uuid('receiving_id').references(() => receivings.id, {
      onDelete: 'set null',
    }),
    status: reconciliationStatusEnum('status').default('matched').notNull(),
    totalOrderAmount: numeric('total_order_amount', {
      precision: 12,
      scale: 2,
    }),
    totalReceivedAmount: numeric('total_received_amount', {
      precision: 12,
      scale: 2,
    }),
    totalInvoicedAmount: numeric('total_invoiced_amount', {
      precision: 12,
      scale: 2,
    }),
    discrepancyAmount: numeric('discrepancy_amount', {
      precision: 12,
      scale: 2,
    }).default('0'),
    discrepancyDetails: jsonb('discrepancy_details').default([]),
    notes: text('notes'),
    resolvedBy: uuid('resolved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_reconciliations_invoice_id').on(table.invoiceId),
    index('idx_reconciliations_order_id').on(table.orderId),
    index('idx_reconciliations_receiving_id').on(table.receivingId),
    index('idx_reconciliations_resolved_by').on(table.resolvedBy),
  ],
);

export const reconciliationsRelations = relations(
  reconciliations,
  ({ one }) => ({
    invoice: one(invoices, {
      fields: [reconciliations.invoiceId],
      references: [invoices.id],
    }),
    order: one(purchaseOrders, {
      fields: [reconciliations.orderId],
      references: [purchaseOrders.id],
    }),
    receiving: one(receivings, {
      fields: [reconciliations.receivingId],
      references: [receivings.id],
    }),
    resolver: one(users, {
      fields: [reconciliations.resolvedBy],
      references: [users.id],
    }),
  }),
);

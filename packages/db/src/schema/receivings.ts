import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import {
  receivingStatusEnum,
  nonConformityTypeEnum,
  nonConformitySeverityEnum,
} from './enums';
import { tenants } from './tenants';
import { suppliers } from './suppliers';
import { purchaseOrders, orderLines } from './orders';
import { products } from './products';
import { users } from './users';

// ---------------------------------------------------------------------------
// receivings
// ---------------------------------------------------------------------------
export const receivings = pgTable(
  'receivings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    receivedBy: uuid('received_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    signatureData: text('signature_data'),
    notes: text('notes'),
    status: receivingStatusEnum('status').default('in_progress').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_receivings_tenant_id').on(table.tenantId),
    index('idx_receivings_order_id').on(table.orderId),
    index('idx_receivings_supplier_id').on(table.supplierId),
    index('idx_receivings_received_by').on(table.receivedBy),
    index('idx_receivings_tenant_deleted').on(table.tenantId, table.deletedAt),
  ],
);

export const receivingsRelations = relations(receivings, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [receivings.tenantId],
    references: [tenants.id],
  }),
  order: one(purchaseOrders, {
    fields: [receivings.orderId],
    references: [purchaseOrders.id],
  }),
  supplier: one(suppliers, {
    fields: [receivings.supplierId],
    references: [suppliers.id],
  }),
  receiver: one(users, {
    fields: [receivings.receivedBy],
    references: [users.id],
  }),
  lines: many(receivingLines),
}));

// ---------------------------------------------------------------------------
// receiving_lines
// ---------------------------------------------------------------------------
export const receivingLines = pgTable(
  'receiving_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    receivingId: uuid('receiving_id')
      .notNull()
      .references(() => receivings.id, { onDelete: 'cascade' }),
    orderLineId: uuid('order_line_id')
      .notNull()
      .references(() => orderLines.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantityOrdered: numeric('quantity_ordered', { precision: 10, scale: 3 }),
    quantityReceived: numeric('quantity_received', { precision: 10, scale: 3 }),
    isConforming: boolean('is_conforming').default(true).notNull(),
    temperature: numeric('temperature', { precision: 5, scale: 2 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_receiving_lines_receiving_id').on(table.receivingId),
    index('idx_receiving_lines_order_line_id').on(table.orderLineId),
    index('idx_receiving_lines_product_id').on(table.productId),
  ],
);

export const receivingLinesRelations = relations(
  receivingLines,
  ({ one, many }) => ({
    receiving: one(receivings, {
      fields: [receivingLines.receivingId],
      references: [receivings.id],
    }),
    orderLine: one(orderLines, {
      fields: [receivingLines.orderLineId],
      references: [orderLines.id],
    }),
    product: one(products, {
      fields: [receivingLines.productId],
      references: [products.id],
    }),
    nonConformities: many(nonConformities),
  }),
);

// ---------------------------------------------------------------------------
// non_conformities
// ---------------------------------------------------------------------------
export const nonConformities = pgTable(
  'non_conformities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    receivingLineId: uuid('receiving_line_id')
      .notNull()
      .references(() => receivingLines.id, { onDelete: 'cascade' }),
    type: nonConformityTypeEnum('type').notNull(),
    severity: nonConformitySeverityEnum('severity').notNull(),
    description: text('description'),
    photoPaths: jsonb('photo_paths').default([]),
    resolved: boolean('resolved').default(false).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolutionNotes: text('resolution_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_non_conformities_receiving_line_id').on(table.receivingLineId),
    index('idx_non_conformities_resolved_by').on(table.resolvedBy),
  ],
);

export const nonConformitiesRelations = relations(
  nonConformities,
  ({ one }) => ({
    receivingLine: one(receivingLines, {
      fields: [nonConformities.receivingLineId],
      references: [receivingLines.id],
    }),
    resolver: one(users, {
      fields: [nonConformities.resolvedBy],
      references: [users.id],
    }),
  }),
);

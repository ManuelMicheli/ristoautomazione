import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  date,
  timestamp,
  serial,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { orderStatusEnum, orderSentViaEnum } from './enums';
import { tenants, locations } from './tenants';
import { suppliers } from './suppliers';
import { products } from './products';
import { supplierProducts } from './products';
import { users } from './users';

// ---------------------------------------------------------------------------
// purchase_orders
// ---------------------------------------------------------------------------
export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    orderNumber: serial('order_number'),
    status: orderStatusEnum('status').default('draft').notNull(),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }),
    notes: text('notes'),
    approvedBy: uuid('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    sentVia: orderSentViaEnum('sent_via'),
    expectedDeliveryDate: date('expected_delivery_date'),
    isUrgent: boolean('is_urgent').default(false).notNull(),
    isRecurringTemplate: boolean('is_recurring_template').default(false).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_purchase_orders_tenant_id').on(table.tenantId),
    index('idx_purchase_orders_location_id').on(table.locationId),
    index('idx_purchase_orders_supplier_id').on(table.supplierId),
    index('idx_purchase_orders_approved_by').on(table.approvedBy),
    index('idx_purchase_orders_created_by').on(table.createdBy),
    index('idx_purchase_orders_tenant_order_number').on(
      table.tenantId,
      table.orderNumber,
    ),
    index('idx_purchase_orders_tenant_deleted').on(
      table.tenantId,
      table.deletedAt,
    ),
  ],
);

export const purchaseOrdersRelations = relations(
  purchaseOrders,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [purchaseOrders.tenantId],
      references: [tenants.id],
    }),
    location: one(locations, {
      fields: [purchaseOrders.locationId],
      references: [locations.id],
    }),
    supplier: one(suppliers, {
      fields: [purchaseOrders.supplierId],
      references: [suppliers.id],
    }),
    approver: one(users, {
      fields: [purchaseOrders.approvedBy],
      references: [users.id],
      relationName: 'orderApprover',
    }),
    creator: one(users, {
      fields: [purchaseOrders.createdBy],
      references: [users.id],
      relationName: 'orderCreator',
    }),
    lines: many(orderLines),
  }),
);

// ---------------------------------------------------------------------------
// order_lines
// ---------------------------------------------------------------------------
export const orderLines = pgTable(
  'order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    supplierProductId: uuid('supplier_product_id')
      .notNull()
      .references(() => supplierProducts.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 10, scale: 3 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 10, scale: 4 }).notNull(),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_order_lines_order_id').on(table.orderId),
    index('idx_order_lines_product_id').on(table.productId),
    index('idx_order_lines_supplier_product_id').on(table.supplierProductId),
  ],
);

export const orderLinesRelations = relations(orderLines, ({ one }) => ({
  order: one(purchaseOrders, {
    fields: [orderLines.orderId],
    references: [purchaseOrders.id],
  }),
  product: one(products, {
    fields: [orderLines.productId],
    references: [products.id],
  }),
  supplierProduct: one(supplierProducts, {
    fields: [orderLines.supplierProductId],
    references: [supplierProducts.id],
  }),
}));

import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  date,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { unitOfMeasureEnum } from './enums';
import { tenants } from './tenants';
import { suppliers } from './suppliers';
import { users } from './users';

// ---------------------------------------------------------------------------
// products
// ---------------------------------------------------------------------------
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category'),
    unit: unitOfMeasureEnum('unit'),
    weightFormat: text('weight_format'),
    internalCode: text('internal_code'),
    allergens: jsonb('allergens').default([]),
    isBio: boolean('is_bio').default(false).notNull(),
    isDop: boolean('is_dop').default(false).notNull(),
    isIgp: boolean('is_igp').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_products_tenant_id').on(table.tenantId),
    index('idx_products_tenant_deleted').on(table.tenantId, table.deletedAt),
  ],
);

export const productsRelations = relations(products, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [products.tenantId],
    references: [tenants.id],
  }),
  supplierProducts: many(supplierProducts),
}));

// ---------------------------------------------------------------------------
// supplier_products
// ---------------------------------------------------------------------------
export const supplierProducts = pgTable(
  'supplier_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    supplierCode: text('supplier_code'),
    currentPrice: numeric('current_price', { precision: 10, scale: 4 }).notNull(),
    currency: text('currency').default('EUR').notNull(),
    minQuantity: numeric('min_quantity', { precision: 10, scale: 2 }),
    priceValidFrom: date('price_valid_from'),
    priceValidTo: date('price_valid_to'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('idx_supplier_products_supplier_product').on(
      table.supplierId,
      table.productId,
    ),
    index('idx_supplier_products_supplier_id').on(table.supplierId),
    index('idx_supplier_products_product_id').on(table.productId),
  ],
);

export const supplierProductsRelations = relations(
  supplierProducts,
  ({ one, many }) => ({
    supplier: one(suppliers, {
      fields: [supplierProducts.supplierId],
      references: [suppliers.id],
    }),
    product: one(products, {
      fields: [supplierProducts.productId],
      references: [products.id],
    }),
    priceHistory: many(priceHistory),
  }),
);

// ---------------------------------------------------------------------------
// price_history
// ---------------------------------------------------------------------------
export const priceHistory = pgTable(
  'price_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierProductId: uuid('supplier_product_id')
      .notNull()
      .references(() => supplierProducts.id, { onDelete: 'cascade' }),
    price: numeric('price', { precision: 10, scale: 4 }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
    changedBy: uuid('changed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    index('idx_price_history_supplier_product_id').on(table.supplierProductId),
    index('idx_price_history_changed_by').on(table.changedBy),
  ],
);

export const priceHistoryRelations = relations(priceHistory, ({ one }) => ({
  supplierProduct: one(supplierProducts, {
    fields: [priceHistory.supplierProductId],
    references: [supplierProducts.id],
  }),
  changedByUser: one(users, {
    fields: [priceHistory.changedBy],
    references: [users.id],
  }),
}));

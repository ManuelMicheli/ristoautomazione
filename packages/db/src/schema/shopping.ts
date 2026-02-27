import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { shoppingFrequencyEnum } from './enums';
import { tenants } from './tenants';
import { users } from './users';

export const shoppingTemplates = pgTable('shopping_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: text('name').notNull(),
  frequency: shoppingFrequencyEnum('frequency').default('weekly'),
  items: jsonb('items').notNull().$type<Array<{ productId: string; quantity: number }>>(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const shoppingTemplatesRelations = relations(shoppingTemplates, ({ one }) => ({
  tenant: one(tenants, {
    fields: [shoppingTemplates.tenantId],
    references: [tenants.id],
  }),
  creator: one(users, {
    fields: [shoppingTemplates.createdBy],
    references: [users.id],
  }),
}));

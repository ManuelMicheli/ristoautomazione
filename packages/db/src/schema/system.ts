import {
  pgTable,
  uuid,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import {
  notificationTypeEnum,
  reportJobStatusEnum,
} from './enums';
import { tenants } from './tenants';
import { users } from './users';

// ---------------------------------------------------------------------------
// audit_log  (immutable — no updated_at, no deleted_at)
// ---------------------------------------------------------------------------
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    userId: uuid('user_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    oldValues: jsonb('old_values'),
    newValues: jsonb('new_values'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_log_tenant_id').on(table.tenantId),
    index('idx_audit_log_user_id').on(table.userId),
    index('idx_audit_log_entity').on(table.entityType, table.entityId),
  ],
);

// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    message: text('message'),
    link: text('link'),
    isRead: boolean('is_read').default(false).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_notifications_tenant_id').on(table.tenantId),
    index('idx_notifications_user_id').on(table.userId),
    index('idx_notifications_tenant_type_read').on(
      table.tenantId,
      table.type,
      table.isRead,
    ),
    index('idx_notifications_tenant_deleted').on(
      table.tenantId,
      table.deletedAt,
    ),
  ],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  tenant: one(tenants, {
    fields: [notifications.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// report_jobs
// ---------------------------------------------------------------------------
export const reportJobs = pgTable(
  'report_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    parameters: jsonb('parameters').default({}),
    status: reportJobStatusEnum('status').default('queued').notNull(),
    filePath: text('file_path'),
    error: text('error'),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_report_jobs_tenant_id').on(table.tenantId),
    index('idx_report_jobs_requested_by').on(table.requestedBy),
    index('idx_report_jobs_tenant_deleted').on(
      table.tenantId,
      table.deletedAt,
    ),
  ],
);

export const reportJobsRelations = relations(reportJobs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [reportJobs.tenantId],
    references: [tenants.id],
  }),
  requester: one(users, {
    fields: [reportJobs.requestedBy],
    references: [users.id],
  }),
}));

import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [
  'owner',
  'purchase_manager',
  'chef',
  'receiver',
  'accountant',
  'viewer',
]);

export const supplierCategoryEnum = pgEnum('supplier_category', [
  'ortofrutta',
  'ittico',
  'carni',
  'latticini',
  'beverage',
  'secco',
  'non_food',
  'altro',
]);

export const supplierDocumentTypeEnum = pgEnum('supplier_document_type', [
  'contract',
  'haccp',
  'bio',
  'dop',
  'durc',
  'visura',
  'other',
]);

export const unitOfMeasureEnum = pgEnum('unit_of_measure', [
  'kg',
  'lt',
  'pz',
  'cartone',
]);

export const orderStatusEnum = pgEnum('order_status', [
  'draft',
  'pending_approval',
  'approved',
  'sent',
  'confirmed',
  'in_delivery',
  'partially_received',
  'received',
  'closed',
  'cancelled',
]);

export const orderSentViaEnum = pgEnum('order_sent_via', [
  'email',
  'manual',
]);

export const receivingStatusEnum = pgEnum('receiving_status', [
  'in_progress',
  'completed',
]);

export const nonConformityTypeEnum = pgEnum('non_conformity_type', [
  'wrong_quantity',
  'wrong_product',
  'temperature',
  'quality',
  'packaging',
  'expired',
]);

export const nonConformitySeverityEnum = pgEnum('non_conformity_severity', [
  'low',
  'medium',
  'high',
  'critical',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'pending_ocr',
  'pending_review',
  'verified',
  'contested',
  'approved',
  'paid',
]);

export const ocrProviderEnum = pgEnum('ocr_provider', [
  'tesseract',
  'google_documentai',
  'aws_textract',
  'manual',
]);

export const reconciliationStatusEnum = pgEnum('reconciliation_status', [
  'matched',
  'discrepancy',
  'contested',
  'resolved',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'order_approval',
  'price_alert',
  'document_expiry',
  'invoice_discrepancy',
  'delivery_due',
  'non_conformity',
  'system',
]);

export const reportJobStatusEnum = pgEnum('report_job_status', [
  'queued',
  'processing',
  'completed',
  'failed',
]);

export const shoppingFrequencyEnum = pgEnum('shopping_frequency', [
  'weekly',
  'biweekly',
  'monthly',
  'custom',
]);

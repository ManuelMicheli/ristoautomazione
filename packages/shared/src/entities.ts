import type {
  UserRole,
  SupplierCategory,
  SupplierDocumentType,
  UnitOfMeasure,
  OrderStatus,
  OrderSentVia,
  ReceivingStatus,
  NonConformityType,
  NonConformitySeverity,
  InvoiceStatus,
  OcrProvider,
  ReconciliationStatus,
  NotificationType,
  ReportJobStatus,
} from './enums';

// Base entity with common fields
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Tenant extends BaseEntity {
  name: string;
  slug: string;
  settings: Record<string, unknown>;
}

export interface Location extends BaseEntity {
  tenantId: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export interface User extends BaseEntity {
  tenantId: string;
  locationId: string | null;
  email: string;
  role: UserRole;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  notificationPreferences: Record<string, unknown>;
}

export interface Supplier extends BaseEntity {
  tenantId: string;
  businessName: string;
  vatNumber: string | null;
  paymentTerms: string | null;
  deliveryDays: number[];
  leadTimeDays: number | null;
  minimumOrderAmount: number | null;
  notes: string | null;
  category: SupplierCategory | null;
  scoreData: SupplierScoreData | null;
}

export interface SupplierScoreData {
  composite: number;
  punctuality: number | null;
  conformity: number | null;
  competitiveness: number | null;
  reliability: number | null;
  calculatedAt: string;
}

export interface SupplierContact extends BaseEntity {
  supplierId: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

export interface SupplierDocument extends BaseEntity {
  supplierId: string;
  type: SupplierDocumentType;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  expiryDate: string | null;
  uploadedBy: string | null;
}

export interface Product extends BaseEntity {
  tenantId: string;
  name: string;
  category: string | null;
  unit: UnitOfMeasure | null;
  weightFormat: string | null;
  internalCode: string | null;
  allergens: string[];
  isBio: boolean;
  isDop: boolean;
  isIgp: boolean;
}

export interface SupplierProduct extends BaseEntity {
  supplierId: string;
  productId: string;
  supplierCode: string | null;
  currentPrice: number;
  currency: string;
  minQuantity: number | null;
  priceValidFrom: string | null;
  priceValidTo: string | null;
  isActive: boolean;
}

export interface PriceHistoryEntry {
  id: string;
  supplierProductId: string;
  price: number;
  recordedAt: string;
  changedBy: string | null;
}

export interface PurchaseOrder extends BaseEntity {
  tenantId: string;
  locationId: string | null;
  supplierId: string;
  orderNumber: number;
  status: OrderStatus;
  totalAmount: number | null;
  notes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  sentVia: OrderSentVia | null;
  expectedDeliveryDate: string | null;
  isUrgent: boolean;
  isRecurringTemplate: boolean;
  createdBy: string | null;
}

export interface OrderLine extends BaseEntity {
  orderId: string;
  productId: string;
  supplierProductId: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: string | null;
}

export interface Receiving extends BaseEntity {
  tenantId: string;
  orderId: string;
  supplierId: string;
  receivedAt: string;
  receivedBy: string | null;
  signatureData: string | null;
  notes: string | null;
  status: ReceivingStatus;
}

export interface ReceivingLine extends BaseEntity {
  receivingId: string;
  orderLineId: string | null;
  productId: string;
  quantityOrdered: number | null;
  quantityReceived: number | null;
  isConforming: boolean;
  temperature: number | null;
  notes: string | null;
}

export interface NonConformity extends BaseEntity {
  receivingLineId: string;
  type: NonConformityType;
  severity: NonConformitySeverity;
  description: string | null;
  photoPaths: string[];
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
}

export interface Invoice extends BaseEntity {
  tenantId: string;
  supplierId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  totalAmount: number | null;
  vatAmount: number | null;
  filePath: string | null;
  ocrProvider: OcrProvider | null;
  ocrConfidence: number | null;
  status: InvoiceStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
}

export interface InvoiceLine extends BaseEntity {
  invoiceId: string;
  description: string | null;
  productId: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  vatRate: number | null;
}

export interface Reconciliation extends BaseEntity {
  invoiceId: string;
  orderId: string | null;
  receivingId: string | null;
  status: ReconciliationStatus;
  totalOrderAmount: number | null;
  totalReceivedAmount: number | null;
  totalInvoicedAmount: number | null;
  discrepancyAmount: number;
  discrepancyDetails: DiscrepancyDetail[];
  notes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface DiscrepancyDetail {
  invoiceLineId: string;
  orderLineId: string | null;
  receivingLineId: string | null;
  type: 'overcharge' | 'quantity_mismatch' | 'unauthorized_item' | 'vat_error';
  expected: number | null;
  actual: number | null;
  difference: number;
  amount: number;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface Notification extends BaseEntity {
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string | null;
  link: string | null;
  isRead: boolean;
  readAt: string | null;
}

export interface ReportJob extends BaseEntity {
  tenantId: string;
  type: string;
  parameters: Record<string, unknown>;
  status: ReportJobStatus;
  filePath: string | null;
  error: string | null;
  requestedBy: string | null;
  completedAt: string | null;
}

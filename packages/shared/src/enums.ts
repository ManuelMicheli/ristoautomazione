export enum UserRole {
  Owner = 'owner',
  PurchaseManager = 'purchase_manager',
  Chef = 'chef',
  Receiver = 'receiver',
  Accountant = 'accountant',
  Viewer = 'viewer',
}

export enum SupplierCategory {
  Ortofrutta = 'ortofrutta',
  Ittico = 'ittico',
  Carni = 'carni',
  Latticini = 'latticini',
  Beverage = 'beverage',
  Secco = 'secco',
  NonFood = 'non_food',
  Altro = 'altro',
}

export enum SupplierDocumentType {
  Contract = 'contract',
  Haccp = 'haccp',
  Bio = 'bio',
  Dop = 'dop',
  Durc = 'durc',
  Visura = 'visura',
  Other = 'other',
}

export enum UnitOfMeasure {
  Kg = 'kg',
  Lt = 'lt',
  Pz = 'pz',
  Cartone = 'cartone',
}

export enum OrderStatus {
  Draft = 'draft',
  PendingApproval = 'pending_approval',
  Approved = 'approved',
  Sent = 'sent',
  Confirmed = 'confirmed',
  InDelivery = 'in_delivery',
  PartiallyReceived = 'partially_received',
  Received = 'received',
  Closed = 'closed',
  Cancelled = 'cancelled',
}

export enum OrderSentVia {
  Email = 'email',
  Manual = 'manual',
}

export enum ReceivingStatus {
  InProgress = 'in_progress',
  Completed = 'completed',
}

export enum NonConformityType {
  WrongQuantity = 'wrong_quantity',
  WrongProduct = 'wrong_product',
  Temperature = 'temperature',
  Quality = 'quality',
  Packaging = 'packaging',
  Expired = 'expired',
}

export enum NonConformitySeverity {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

export enum InvoiceStatus {
  PendingOcr = 'pending_ocr',
  PendingReview = 'pending_review',
  Verified = 'verified',
  Contested = 'contested',
  Approved = 'approved',
  Paid = 'paid',
}

export enum OcrProvider {
  Tesseract = 'tesseract',
  GoogleDocumentAi = 'google_documentai',
  AwsTextract = 'aws_textract',
  Manual = 'manual',
}

export enum ReconciliationStatus {
  Matched = 'matched',
  Discrepancy = 'discrepancy',
  Contested = 'contested',
  Resolved = 'resolved',
}

export enum NotificationType {
  OrderApproval = 'order_approval',
  PriceAlert = 'price_alert',
  DocumentExpiry = 'document_expiry',
  InvoiceDiscrepancy = 'invoice_discrepancy',
  DeliveryDue = 'delivery_due',
  NonConformity = 'non_conformity',
  System = 'system',
}

export enum ReportJobStatus {
  Queued = 'queued',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
}

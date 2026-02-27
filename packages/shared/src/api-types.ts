import type {
  SupplierCategory,
  UnitOfMeasure,
  OrderStatus,
  ReceivingStatus,
  InvoiceStatus,
  NonConformityType,
  NonConformitySeverity,
  UserRole,
} from './enums';

// Generic API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type PaginatedResponse<T> = ApiResponse<T[]>;

// Sort and filter types
export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

export interface DateRange {
  from: string;
  to: string;
}

// Request types - Suppliers
export interface CreateSupplierRequest {
  businessName: string;
  vatNumber?: string;
  paymentTerms?: string;
  deliveryDays?: number[];
  leadTimeDays?: number;
  minimumOrderAmount?: number;
  notes?: string;
  category?: SupplierCategory;
  contacts?: CreateSupplierContactRequest[];
}

export interface UpdateSupplierRequest {
  businessName?: string;
  vatNumber?: string;
  paymentTerms?: string;
  deliveryDays?: number[];
  leadTimeDays?: number;
  minimumOrderAmount?: number;
  notes?: string;
  category?: SupplierCategory;
}

export interface CreateSupplierContactRequest {
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
}

// Request types - Products
export interface CreateProductRequest {
  name: string;
  category?: string;
  unit?: UnitOfMeasure;
  weightFormat?: string;
  internalCode?: string;
  allergens?: string[];
  isBio?: boolean;
  isDop?: boolean;
  isIgp?: boolean;
}

export interface UpdateProductRequest extends Partial<CreateProductRequest> {}

export interface LinkSupplierProductRequest {
  supplierId: string;
  supplierCode?: string;
  currentPrice: number;
  minQuantity?: number;
  priceValidFrom?: string;
  priceValidTo?: string;
}

export interface ImportPriceListResponse {
  columns: { index: number; detectedField: string | null; sampleValues: string[] }[];
  rowsCount: number;
  previewRows: Record<string, string>[];
}

export interface ConfirmPriceListRequest {
  supplierId: string;
  columnMapping: Record<string, number>;
  data: Record<string, string>[];
}

export interface PriceListConfirmResult {
  updated: number;
  created: number;
  errors: { row: number; message: string }[];
  priceAlerts: { product: string; oldPrice: number; newPrice: number; changePercent: number }[];
}

// Request types - Orders
export interface CreateOrderRequest {
  supplierId: string;
  locationId?: string;
  lines: CreateOrderLineRequest[];
  notes?: string;
  isUrgent?: boolean;
  expectedDeliveryDate?: string;
}

export interface CreateOrderLineRequest {
  productId: string;
  supplierProductId?: string;
  quantity: number;
}

export interface UpdateOrderLineRequest {
  quantity?: number;
  notes?: string;
}

// Request types - Receivings
export interface CreateReceivingRequest {
  orderId: string;
}

export interface UpdateReceivingLineRequest {
  quantityReceived?: number;
  isConforming?: boolean;
  temperature?: number;
  notes?: string;
}

export interface CompleteReceivingRequest {
  signatureData: string;
}

export interface CreateNonConformityRequest {
  type: NonConformityType;
  severity: NonConformitySeverity;
  description?: string;
}

// Request types - Invoices
export interface UpdateInvoiceRequest {
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  totalAmount?: number;
  vatAmount?: number;
  lines?: UpdateInvoiceLineRequest[];
}

export interface UpdateInvoiceLineRequest {
  id?: string;
  description?: string;
  productId?: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
  vatRate?: number;
}

export interface ReconcileInvoiceRequest {
  orderId?: string;
  receivingId?: string;
}

// Filter types
export interface SupplierFilters {
  search?: string;
  category?: SupplierCategory;
  hasDocumentsExpiring?: boolean;
}

export interface ProductFilters {
  search?: string;
  category?: string;
  supplierId?: string;
  allergens?: string[];
  isBio?: boolean;
  isDop?: boolean;
  isIgp?: boolean;
}

export interface OrderFilters {
  status?: OrderStatus[];
  supplierId?: string;
  dateRange?: DateRange;
  isUrgent?: boolean;
  createdBy?: string;
}

export interface ReceivingFilters {
  supplierId?: string;
  dateRange?: DateRange;
  status?: ReceivingStatus;
}

export interface InvoiceFilters {
  status?: InvoiceStatus[];
  supplierId?: string;
  dateRange?: DateRange;
  dueDateRange?: DateRange;
}

// Analytics types
export interface SpendingOverview {
  currentPeriod: PeriodSpending;
  previousPeriod: PeriodSpending;
  samePeriodLastYear: PeriodSpending | null;
  percentChange: {
    vsPrevious: number;
    vsLastYear: number | null;
  };
}

export interface PeriodSpending {
  amount: number;
  orderCount: number;
  supplierCount: number;
  startDate: string;
  endDate: string;
}

export interface CategorySpending {
  category: string;
  amount: number;
  percentage: number;
  orderCount: number;
}

export interface SupplierSpending {
  supplierId: string;
  supplierName: string;
  amount: number;
  percentage: number;
  orderCount: number;
}

export interface SpendingTrend {
  month: string;
  amount: number;
  orderCount: number;
}

export interface DashboardSummary {
  activeSuppliers: number;
  activeProducts: number;
  ordersThisMonth: number;
  pendingApprovals: number;
  unverifiedInvoices: number;
  expiringDocuments: number;
  totalSpendThisMonth: number;
}

// Scoring types
export interface SupplierScore {
  composite: number;
  punctuality: ScoreDimension | null;
  conformity: ScoreDimension | null;
  competitiveness: CompetitivenessScore | null;
  reliability: ScoreDimension | null;
  calculatedAt: string;
  dataRange: DateRange;
}

export interface ScoreDimension {
  score: number;
  numerator: number;
  denominator: number;
}

export interface CompetitivenessScore {
  score: number;
  avgDeviation: number;
  productScores: {
    productName: string;
    supplierPrice: number;
    avgPrice: number;
    deviation: number;
  }[];
}

// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  firstName: string | null;
  lastName: string | null;
}

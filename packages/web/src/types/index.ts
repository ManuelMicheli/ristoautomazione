// Common API response type
export interface ApiResponse<T> {
  data: T;
  message?: string;
  pagination?: PaginationMeta;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, string[]>;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

// Auth types
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'admin' | 'manager' | 'operator' | 'viewer';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

// Supplier types
export interface Supplier {
  id: string;
  name: string;
  code: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  vatNumber: string;
  paymentTerms: number;
  rating: number;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Product types
export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  currentPrice: number;
  supplierId: string;
  supplierName: string;
  minStock: number;
  currentStock: number;
  isActive: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// Order types
export type OrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export interface Order {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  status: OrderStatus;
  totalAmount: number;
  items: OrderItem[];
  notes?: string;
  expectedDeliveryDate: string;
  createdBy: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  receivedQuantity: number;
  unit: string;
}

// Invoice types
export type InvoiceStatus =
  | 'uploaded'
  | 'processing'
  | 'matched'
  | 'discrepancy'
  | 'approved'
  | 'paid';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  orderId?: string;
  orderNumber?: string;
  status: InvoiceStatus;
  totalAmount: number;
  taxAmount: number;
  netAmount: number;
  issueDate: string;
  dueDate: string;
  paidDate?: string;
  fileUrl: string;
  items: InvoiceItem[];
  discrepancies: Discrepancy[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  matchedOrderItemId?: string;
}

export interface Discrepancy {
  id: string;
  type: 'price' | 'quantity' | 'missing_item' | 'extra_item';
  field: string;
  expectedValue: string;
  actualValue: string;
  resolved: boolean;
  resolution?: string;
}

// Receiving types
export interface Receiving {
  id: string;
  orderId: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  receivedDate: string;
  receivedBy: string;
  items: ReceivingItem[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceivingItem {
  id: string;
  orderItemId: string;
  productId: string;
  productName: string;
  expectedQuantity: number;
  receivedQuantity: number;
  unit: string;
  qualityCheck: 'passed' | 'failed' | 'pending';
  notes?: string;
}

// Dashboard types
export interface DashboardStats {
  totalOrders: number;
  pendingOrders: number;
  totalSuppliers: number;
  activeSuppliers: number;
  monthlySpend: number;
  budgetRemaining: number;
  pendingInvoices: number;
  overduePayments: number;
}

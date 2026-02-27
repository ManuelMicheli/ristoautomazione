import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

// Lazy-loaded layout
const AppLayout = React.lazy(() => import('@/components/layout/AppLayout'));

// Lazy-loaded pages - Auth
const LoginPage = React.lazy(() => import('@/pages/auth/LoginPage'));

// Lazy-loaded pages - Dashboard
const DashboardPage = React.lazy(
  () => import('@/pages/dashboard/DashboardPage')
);

// Lazy-loaded pages - Suppliers
const SuppliersListPage = React.lazy(
  () => import('@/pages/suppliers/SuppliersListPage')
);
const SupplierDetailPage = React.lazy(
  () => import('@/pages/suppliers/SupplierDetailPage')
);
const SupplierNewPage = React.lazy(
  () => import('@/pages/suppliers/SupplierNewPage')
);
const SupplierRankingPage = React.lazy(
  () => import('@/pages/suppliers/SupplierRankingPage')
);
const RiskMapPage = React.lazy(
  () => import('@/pages/suppliers/RiskMapPage')
);

// Lazy-loaded pages - Products
const ProductsListPage = React.lazy(
  () => import('@/pages/products/ProductsListPage')
);
const ProductDetailPage = React.lazy(
  () => import('@/pages/products/ProductDetailPage')
);
const ProductNewPage = React.lazy(
  () => import('@/pages/products/ProductNewPage')
);
const ProductImportPage = React.lazy(
  () => import('@/pages/products/ProductImportPage')
);

// Lazy-loaded pages - Orders
const OrdersListPage = React.lazy(
  () => import('@/pages/orders/OrdersListPage')
);
const OrderDetailPage = React.lazy(
  () => import('@/pages/orders/OrderDetailPage')
);
const OrderNewPage = React.lazy(
  () => import('@/pages/orders/OrderNewPage')
);
const OrderTemplatesPage = React.lazy(
  () => import('@/pages/orders/OrderTemplatesPage')
);
const OrderApprovalsPage = React.lazy(
  () => import('@/pages/orders/OrderApprovalsPage')
);

// Lazy-loaded pages - Receiving
const ReceivingListPage = React.lazy(
  () => import('@/pages/receiving/ReceivingListPage')
);
const ReceivingChecklistPage = React.lazy(
  () => import('@/pages/receiving/ReceivingChecklistPage')
);
const ReceivingDetailPage = React.lazy(
  () => import('@/pages/receiving/ReceivingDetailPage')
);

// Lazy-loaded pages - Invoices
const InvoicesListPage = React.lazy(
  () => import('@/pages/invoices/InvoicesListPage')
);
const InvoiceDetailPage = React.lazy(
  () => import('@/pages/invoices/InvoiceDetailPage')
);
const InvoiceUploadPage = React.lazy(
  () => import('@/pages/invoices/InvoiceUploadPage')
);
const InvoiceReconcilePage = React.lazy(
  () => import('@/pages/invoices/InvoiceReconcilePage')
);
const InvoicePaymentsPage = React.lazy(
  () => import('@/pages/invoices/InvoicePaymentsPage')
);
const InvoiceDiscrepanciesPage = React.lazy(
  () => import('@/pages/invoices/InvoiceDiscrepanciesPage')
);

// Lazy-loaded pages - Shopping
const ShoppingListPage = React.lazy(
  () => import('@/pages/shopping/ShoppingListPage')
);
const ShoppingTemplatesPage = React.lazy(
  () => import('@/pages/shopping/ShoppingTemplatesPage')
);

// Lazy-loaded pages - Settings
const SettingsPage = React.lazy(
  () => import('@/pages/settings/SettingsPage')
);

/**
 * Full-page loading spinner shown during lazy loading.
 */
function PageLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-accent-green" />
        <p className="text-sm text-primary-400">Caricamento...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes with AppLayout */}
        <Route path="/" element={<AppLayout />}>
          {/* Default redirect to dashboard */}
          <Route index element={<Navigate to="/dashboard" replace />} />

          {/* Dashboard */}
          <Route path="dashboard" element={<DashboardPage />} />

          {/* Suppliers */}
          <Route path="suppliers" element={<SuppliersListPage />} />
          <Route path="suppliers/new" element={<SupplierNewPage />} />
          <Route path="suppliers/ranking" element={<SupplierRankingPage />} />
          <Route path="suppliers/risk-map" element={<RiskMapPage />} />
          <Route path="suppliers/:id" element={<SupplierDetailPage />} />

          {/* Products */}
          <Route path="products" element={<ProductsListPage />} />
          <Route path="products/new" element={<ProductNewPage />} />
          <Route path="products/import" element={<ProductImportPage />} />
          <Route path="products/:id" element={<ProductDetailPage />} />

          {/* Shopping */}
          <Route path="spesa" element={<ShoppingListPage />} />
          <Route path="spesa/templates" element={<ShoppingTemplatesPage />} />

          {/* Orders */}
          <Route path="orders" element={<OrdersListPage />} />
          <Route path="orders/new" element={<OrderNewPage />} />
          <Route path="orders/templates" element={<OrderTemplatesPage />} />
          <Route path="orders/approvals" element={<OrderApprovalsPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />

          {/* Receiving */}
          <Route path="receiving" element={<ReceivingListPage />} />
          <Route
            path="receiving/:id/detail"
            element={<ReceivingDetailPage />}
          />
          <Route path="receiving/:id" element={<ReceivingChecklistPage />} />

          {/* Invoices */}
          <Route path="invoices" element={<InvoicesListPage />} />
          <Route path="invoices/upload" element={<InvoiceUploadPage />} />
          <Route
            path="invoices/payments"
            element={<InvoicePaymentsPage />}
          />
          <Route
            path="invoices/discrepancies"
            element={<InvoiceDiscrepanciesPage />}
          />
          <Route
            path="invoices/:id/reconcile"
            element={<InvoiceReconcilePage />}
          />
          <Route path="invoices/:id" element={<InvoiceDetailPage />} />

          {/* Settings */}
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

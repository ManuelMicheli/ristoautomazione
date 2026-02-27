import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/rbac';
import { AnalyticsService } from '../../services/analytics-service';

const periodQuerySchema = z.object({
  period: z.enum(['month', 'quarter', 'year']).optional().default('month'),
});

const spendingBySupplierQuerySchema = z.object({
  period: z.enum(['month', 'quarter', 'year']).optional().default('month'),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const spendingTrendQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).optional().default(12),
});

export async function analyticsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // Helper to get redis safely
  const getRedis = () => {
    try {
      return app.redis || null;
    } catch {
      return null;
    }
  };

  // -------------------------------------------------------------------------
  // GET /analytics/spending-overview — current vs previous vs last year
  // -------------------------------------------------------------------------
  app.get('/spending-overview', {
    preHandler: [requirePermission('analytics', 'read')],
    handler: async (request, reply) => {
      const { period } = periodQuerySchema.parse(request.query);
      const data = await AnalyticsService.spendingOverview(
        app.db,
        getRedis(),
        request.user.tenantId,
        period,
      );
      return { success: true, data };
    },
  });

  // -------------------------------------------------------------------------
  // GET /analytics/spending-by-category — grouped by product category
  // -------------------------------------------------------------------------
  app.get('/spending-by-category', {
    preHandler: [requirePermission('analytics', 'read')],
    handler: async (request, reply) => {
      const { period } = periodQuerySchema.parse(request.query);
      const data = await AnalyticsService.spendingByCategory(
        app.db,
        getRedis(),
        request.user.tenantId,
        period,
      );
      return { success: true, data };
    },
  });

  // -------------------------------------------------------------------------
  // GET /analytics/spending-by-supplier — top N suppliers by spend
  // -------------------------------------------------------------------------
  app.get('/spending-by-supplier', {
    preHandler: [requirePermission('analytics', 'read')],
    handler: async (request, reply) => {
      const { period, limit } = spendingBySupplierQuerySchema.parse(
        request.query,
      );
      const data = await AnalyticsService.spendingBySupplier(
        app.db,
        getRedis(),
        request.user.tenantId,
        period,
        limit,
      );
      return { success: true, data };
    },
  });

  // -------------------------------------------------------------------------
  // GET /analytics/spending-trend — monthly time series
  // -------------------------------------------------------------------------
  app.get('/spending-trend', {
    preHandler: [requirePermission('analytics', 'read')],
    handler: async (request, reply) => {
      const { months } = spendingTrendQuerySchema.parse(request.query);
      const data = await AnalyticsService.spendingTrend(
        app.db,
        getRedis(),
        request.user.tenantId,
        months,
      );
      return { success: true, data };
    },
  });

  // -------------------------------------------------------------------------
  // GET /analytics/summary — dashboard quick stats
  // -------------------------------------------------------------------------
  app.get('/summary', {
    preHandler: [requirePermission('analytics', 'read')],
    handler: async (request, reply) => {
      const data = await AnalyticsService.summary(
        app.db,
        getRedis(),
        request.user.tenantId,
      );
      return { success: true, data };
    },
  });

  // -------------------------------------------------------------------------
  // GET /analytics/dashboard — aggregated dashboard stats for frontend
  // -------------------------------------------------------------------------
  app.get('/dashboard', {
    preHandler: [requirePermission('analytics', 'read')],
    handler: async (request, reply) => {
      const redis = getRedis();
      const tenantId = request.user.tenantId;

      const [summary, overview] = await Promise.all([
        AnalyticsService.summary(app.db, redis, tenantId),
        AnalyticsService.spendingOverview(app.db, redis, tenantId, 'month'),
      ]);

      const trendValue = overview.percentChange.vsPrevious;
      const data = {
        monthlySpend: summary.totalSpendThisMonth,
        monthlySpendTrend: {
          value: Math.abs(trendValue),
          direction: trendValue >= 0 ? 'up' : 'down',
        },
        activeOrders: summary.ordersThisMonth,
        activeAlerts: summary.expiringDocuments + summary.unverifiedInvoices,
        pendingActions: summary.pendingApprovals,
      };

      return { success: true, data };
    },
  });

  // -------------------------------------------------------------------------
  // GET /analytics/category-breakdown — alias for spending-by-category
  // -------------------------------------------------------------------------
  app.get('/category-breakdown', {
    preHandler: [requirePermission('analytics', 'read')],
    handler: async (request, reply) => {
      const { period } = periodQuerySchema.parse(request.query);
      const data = await AnalyticsService.spendingByCategory(
        app.db,
        getRedis(),
        request.user.tenantId,
        period,
      );
      return { success: true, data };
    },
  });

  // -------------------------------------------------------------------------
  // GET /analytics/alerts — active alerts and notifications
  // -------------------------------------------------------------------------
  app.get('/alerts', {
    preHandler: [requirePermission('analytics', 'read')],
    handler: async (request, reply) => {
      const redis = getRedis();
      const tenantId = request.user.tenantId;
      const summary = await AnalyticsService.summary(app.db, redis, tenantId);
      const alerts: Array<{
        id: string;
        type: string;
        title: string;
        description: string;
        severity: string;
        createdAt: string;
        actionUrl?: string;
      }> = [];

      if (summary.pendingApprovals > 0) {
        alerts.push({
          id: 'alert-pending-approvals',
          type: 'action_required',
          title: `${summary.pendingApprovals} ordini in attesa di approvazione`,
          description: 'Ci sono ordini che richiedono la tua approvazione.',
          severity: 'warning',
          createdAt: new Date().toISOString(),
          actionUrl: '/orders?status=pending_approval',
        });
      }

      if (summary.unverifiedInvoices > 0) {
        alerts.push({
          id: 'alert-unverified-invoices',
          type: 'action_required',
          title: `${summary.unverifiedInvoices} fatture da verificare`,
          description: 'Ci sono fatture in attesa di verifica OCR o revisione manuale.',
          severity: 'info',
          createdAt: new Date().toISOString(),
          actionUrl: '/invoices?status=pending_review',
        });
      }

      if (summary.expiringDocuments > 0) {
        alerts.push({
          id: 'alert-expiring-docs',
          type: 'expiring_contract',
          title: `${summary.expiringDocuments} documenti in scadenza`,
          description: 'Alcuni documenti fornitore scadranno nei prossimi 30 giorni.',
          severity: 'warning',
          createdAt: new Date().toISOString(),
          actionUrl: '/suppliers',
        });
      }

      return { success: true, data: alerts };
    },
  });
}

import { FastifyInstance } from 'fastify';
import { UserRole } from '@cph/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireRole } from '../../middleware/rbac';
import { logAudit } from '../../middleware/audit';
import { OrderService } from '../../services/order-service';
import {
  createOrderSchema,
  updateOrderSchema,
  addOrderLineSchema,
  updateOrderLineSchema,
  listOrdersQuerySchema,
  rejectOrderSchema,
} from './schemas';

export async function orderRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // -------------------------------------------------------------------------
  // GET /orders — list with filters
  // -------------------------------------------------------------------------
  app.get('/', {
    preHandler: [requirePermission('orders', 'read')],
    handler: async (request, reply) => {
      const filters = listOrdersQuerySchema.parse(request.query);
      const result = await OrderService.list(
        app.db,
        request.user.tenantId,
        filters,
      );

      return {
        success: true,
        data: result.data,
        pagination: result.pagination,
      };
    },
  });

  // -------------------------------------------------------------------------
  // POST /orders — create draft order
  // -------------------------------------------------------------------------
  app.post('/', {
    preHandler: [requirePermission('orders', 'create')],
    handler: async (request, reply) => {
      const data = createOrderSchema.parse(request.body);
      const order = await OrderService.create(
        app.db,
        request.user.tenantId,
        request.user.id,
        data,
      );

      await logAudit(app.db, request, {
        action: 'order.created',
        entityType: 'purchase_order',
        entityId: order.id,
        newValues: {
          supplierId: data.supplierId,
          linesCount: data.lines.length,
          totalAmount: order.totalAmount,
          status: 'draft',
        },
      });

      return reply.status(201).send({ success: true, data: order });
    },
  });

  // -------------------------------------------------------------------------
  // GET /orders/pending-approval — pending approvals
  // -------------------------------------------------------------------------
  app.get('/pending-approval', {
    preHandler: [requirePermission('orders', 'read')],
    handler: async (request, reply) => {
      const orders = await OrderService.getPendingApprovals(
        app.db,
        request.user.tenantId,
      );
      return { success: true, data: orders };
    },
  });

  // -------------------------------------------------------------------------
  // GET /orders/templates — recurring templates
  // -------------------------------------------------------------------------
  app.get('/templates', {
    preHandler: [requirePermission('orders', 'read')],
    handler: async (request, reply) => {
      const templates = await OrderService.listTemplates(
        app.db,
        request.user.tenantId,
      );
      return { success: true, data: templates };
    },
  });

  // -------------------------------------------------------------------------
  // GET /orders/:id — order detail with lines and status history
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('orders', 'read')],
    handler: async (request, reply) => {
      const order = await OrderService.getById(
        app.db,
        request.user.tenantId,
        request.params.id,
      );

      if (!order) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Ordine non trovato',
          },
        });
      }

      return { success: true, data: order };
    },
  });

  // -------------------------------------------------------------------------
  // PUT /orders/:id — update draft order
  // -------------------------------------------------------------------------
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('orders', 'update')],
    handler: async (request, reply) => {
      const data = updateOrderSchema.parse(request.body);
      const order = await OrderService.update(
        app.db,
        request.user.tenantId,
        request.params.id,
        data,
      );

      await logAudit(app.db, request, {
        action: 'order.updated',
        entityType: 'purchase_order',
        entityId: request.params.id,
        newValues: data as Record<string, unknown>,
      });

      return { success: true, data: order };
    },
  });

  // -------------------------------------------------------------------------
  // DELETE /orders/:id — cancel order
  // -------------------------------------------------------------------------
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('orders', 'delete')],
    handler: async (request, reply) => {
      const order = await OrderService.cancel(
        app.db,
        request.user.tenantId,
        request.params.id,
      );

      await logAudit(app.db, request, {
        action: 'order.cancelled',
        entityType: 'purchase_order',
        entityId: request.params.id,
        newValues: { status: 'cancelled' },
      });

      return { success: true, data: order };
    },
  });

  // -------------------------------------------------------------------------
  // POST /orders/:id/lines — add line to draft order
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/:id/lines', {
    preHandler: [requirePermission('orders', 'update')],
    handler: async (request, reply) => {
      const data = addOrderLineSchema.parse(request.body);
      const line = await OrderService.addLine(
        app.db,
        request.params.id,
        data,
      );

      await logAudit(app.db, request, {
        action: 'order.line_added',
        entityType: 'purchase_order',
        entityId: request.params.id,
        newValues: {
          lineId: line.id,
          productId: data.productId,
          quantity: data.quantity,
        },
      });

      return reply.status(201).send({ success: true, data: line });
    },
  });

  // -------------------------------------------------------------------------
  // PUT /orders/:id/lines/:lineId — update order line
  // -------------------------------------------------------------------------
  app.put<{ Params: { id: string; lineId: string } }>(
    '/:id/lines/:lineId',
    {
      preHandler: [requirePermission('orders', 'update')],
      handler: async (request, reply) => {
        const data = updateOrderLineSchema.parse(request.body);
        const line = await OrderService.updateLine(
          app.db,
          request.params.id,
          request.params.lineId,
          data,
        );

        await logAudit(app.db, request, {
          action: 'order.line_updated',
          entityType: 'purchase_order',
          entityId: request.params.id,
          newValues: {
            lineId: request.params.lineId,
            ...data,
          },
        });

        return { success: true, data: line };
      },
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /orders/:id/lines/:lineId — remove order line
  // -------------------------------------------------------------------------
  app.delete<{ Params: { id: string; lineId: string } }>(
    '/:id/lines/:lineId',
    {
      preHandler: [requirePermission('orders', 'delete')],
      handler: async (request, reply) => {
        const line = await OrderService.removeLine(
          app.db,
          request.params.id,
          request.params.lineId,
        );

        await logAudit(app.db, request, {
          action: 'order.line_removed',
          entityType: 'purchase_order',
          entityId: request.params.id,
          newValues: { lineId: request.params.lineId },
        });

        return { success: true, data: line };
      },
    },
  );

  // -------------------------------------------------------------------------
  // POST /orders/:id/submit — submit for approval or auto-approve
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/:id/submit', {
    preHandler: [requirePermission('orders', 'update')],
    handler: async (request, reply) => {
      const { order, newStatus } = await OrderService.submit(
        app.db,
        request.user.tenantId,
        request.params.id,
        request.user.id,
      );

      await logAudit(app.db, request, {
        action: `order.submitted`,
        entityType: 'purchase_order',
        entityId: request.params.id,
        oldValues: { status: 'draft' },
        newValues: { status: newStatus },
      });

      return {
        success: true,
        data: order,
        meta: {
          newStatus,
          autoApproved: newStatus === 'approved',
        },
      };
    },
  });

  // -------------------------------------------------------------------------
  // POST /orders/:id/approve — approve order (Owner, PurchaseManager only)
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/:id/approve', {
    preHandler: [
      requireRole(UserRole.Owner, UserRole.PurchaseManager),
    ],
    handler: async (request, reply) => {
      const order = await OrderService.approve(
        app.db,
        request.user.tenantId,
        request.params.id,
        request.user.id,
      );

      await logAudit(app.db, request, {
        action: 'order.approved',
        entityType: 'purchase_order',
        entityId: request.params.id,
        oldValues: { status: 'pending_approval' },
        newValues: {
          status: 'approved',
          approvedBy: request.user.id,
        },
      });

      return { success: true, data: order };
    },
  });

  // -------------------------------------------------------------------------
  // POST /orders/:id/reject — reject back to draft
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/:id/reject', {
    preHandler: [
      requireRole(UserRole.Owner, UserRole.PurchaseManager),
    ],
    handler: async (request, reply) => {
      const data = rejectOrderSchema.parse(request.body);
      const order = await OrderService.reject(
        app.db,
        request.user.tenantId,
        request.params.id,
        request.user.id,
        data.reason,
      );

      await logAudit(app.db, request, {
        action: 'order.rejected',
        entityType: 'purchase_order',
        entityId: request.params.id,
        oldValues: { status: 'pending_approval' },
        newValues: { status: 'draft', rejectionReason: data.reason },
      });

      return { success: true, data: order };
    },
  });

  // -------------------------------------------------------------------------
  // POST /orders/:id/send — mark as sent
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/:id/send', {
    preHandler: [requirePermission('orders', 'update')],
    handler: async (request, reply) => {
      const order = await OrderService.send(
        app.db,
        request.user.tenantId,
        request.params.id,
      );

      await logAudit(app.db, request, {
        action: 'order.sent',
        entityType: 'purchase_order',
        entityId: request.params.id,
        oldValues: { status: 'approved' },
        newValues: { status: 'sent', sentVia: 'email' },
      });

      return { success: true, data: order };
    },
  });

  // -------------------------------------------------------------------------
  // POST /orders/:id/confirm — mark as confirmed by supplier
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/:id/confirm', {
    preHandler: [requirePermission('orders', 'update')],
    handler: async (request, reply) => {
      const order = await OrderService.confirm(
        app.db,
        request.params.id,
      );

      await logAudit(app.db, request, {
        action: 'order.confirmed',
        entityType: 'purchase_order',
        entityId: request.params.id,
        oldValues: { status: 'sent' },
        newValues: { status: 'confirmed' },
      });

      return { success: true, data: order };
    },
  });

  // -------------------------------------------------------------------------
  // POST /orders/:id/mark-in-delivery — mark as in delivery
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/:id/mark-in-delivery', {
    preHandler: [requirePermission('orders', 'update')],
    handler: async (request, reply) => {
      const order = await OrderService.markInDelivery(
        app.db,
        request.params.id,
      );

      await logAudit(app.db, request, {
        action: 'order.in_delivery',
        entityType: 'purchase_order',
        entityId: request.params.id,
        oldValues: { status: 'confirmed' },
        newValues: { status: 'in_delivery' },
      });

      return { success: true, data: order };
    },
  });

  // -------------------------------------------------------------------------
  // POST /orders/:id/clone — clone as new draft
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/:id/clone', {
    preHandler: [requirePermission('orders', 'create')],
    handler: async (request, reply) => {
      const order = await OrderService.cloneOrder(
        app.db,
        request.user.tenantId,
        request.params.id,
        request.user.id,
      );

      await logAudit(app.db, request, {
        action: 'order.cloned',
        entityType: 'purchase_order',
        entityId: order.id,
        newValues: {
          clonedFrom: request.params.id,
          totalAmount: order.totalAmount,
        },
      });

      return reply.status(201).send({ success: true, data: order });
    },
  });

  // -------------------------------------------------------------------------
  // POST /orders/:id/save-as-template — save as recurring template
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/:id/save-as-template', {
    preHandler: [requirePermission('orders', 'update')],
    handler: async (request, reply) => {
      const order = await OrderService.saveAsTemplate(
        app.db,
        request.params.id,
      );

      await logAudit(app.db, request, {
        action: 'order.saved_as_template',
        entityType: 'purchase_order',
        entityId: request.params.id,
        newValues: { isRecurringTemplate: true },
      });

      return { success: true, data: order };
    },
  });
}

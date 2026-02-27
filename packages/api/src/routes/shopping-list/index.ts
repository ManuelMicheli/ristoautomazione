import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/rbac';
import { ShoppingListService } from '../../services/shopping-list-service';
import {
  optimizeRequestSchema,
  generateOrdersSchema,
  createTemplateSchema,
  updateTemplateSchema,
} from './schemas';

const service = new ShoppingListService();

export async function shoppingListRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // POST /shopping-list/optimize
  app.post('/optimize', {
    preHandler: [requirePermission('orders', 'create')],
    handler: async (request, reply) => {
      const body = optimizeRequestSchema.parse(request.body);
      const user = request.user;

      const result = await service.optimize(app.db, user.tenantId, body);
      return reply.send({ success: true, data: result });
    },
  });

  // POST /shopping-list/generate-orders
  app.post('/generate-orders', {
    preHandler: [requirePermission('orders', 'create')],
    handler: async (request, reply) => {
      const body = generateOrdersSchema.parse(request.body);
      const user = request.user;

      const orderIds = await service.generateOrders(
        app.db,
        user.tenantId,
        user.id,
        body.locationId,
        body.orders,
        body.deliveryDate,
        body.notes,
      );

      return reply.code(201).send({ success: true, data: { orderIds } });
    },
  });

  // POST /shopping-list/from-csv
  app.post('/from-csv', {
    preHandler: [requirePermission('orders', 'create')],
    handler: async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Nessun file caricato' },
        });
      }

      const buffer = await file.toBuffer();
      const csvContent = buffer.toString('utf-8');
      const user = request.user;

      const result = await service.parseCSV(app.db, user.tenantId, csvContent);
      return reply.send({ success: true, data: result });
    },
  });

  // ---------- Templates ----------

  // GET /shopping-list/templates
  app.get('/templates', {
    handler: async (request, reply) => {
      const user = request.user;
      const templates = await service.listTemplates(app.db, user.tenantId);
      return reply.send({ success: true, data: templates });
    },
  });

  // POST /shopping-list/templates
  app.post('/templates', {
    handler: async (request, reply) => {
      const body = createTemplateSchema.parse(request.body);
      const user = request.user;
      const template = await service.createTemplate(
        app.db,
        user.tenantId,
        user.id,
        body,
      );
      return reply.code(201).send({ success: true, data: template });
    },
  });

  // PUT /shopping-list/templates/:id
  app.put<{ Params: { id: string } }>('/templates/:id', {
    handler: async (request, reply) => {
      const { id } = request.params;
      const body = updateTemplateSchema.parse(request.body);
      const template = await service.updateTemplate(app.db, id, body);
      return reply.send({ success: true, data: template });
    },
  });

  // DELETE /shopping-list/templates/:id
  app.delete<{ Params: { id: string } }>('/templates/:id', {
    handler: async (request, reply) => {
      const { id } = request.params;
      await service.deleteTemplate(app.db, id);
      return reply.code(204).send();
    },
  });

  // POST /shopping-list/templates/:id/launch
  app.post<{ Params: { id: string } }>('/templates/:id/launch', {
    preHandler: [requirePermission('orders', 'create')],
    handler: async (request, reply) => {
      const { id } = request.params;
      const user = request.user;
      const template = await service.getTemplate(app.db, id);
      if (!template) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Template non trovato' },
        });
      }

      const body = request.body as
        | { desiredDeliveryDate?: string }
        | undefined;

      const result = await service.optimize(app.db, user.tenantId, {
        items: template.items as Array<{
          productId: string;
          quantity: number;
        }>,
        desiredDeliveryDate: body?.desiredDeliveryDate,
      });

      return reply.send({
        success: true,
        data: { template, optimization: result },
      });
    },
  });
}

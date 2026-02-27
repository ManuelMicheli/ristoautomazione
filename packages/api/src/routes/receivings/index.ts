import { FastifyInstance } from 'fastify';
import { UserRole } from '@cph/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireRole } from '../../middleware/rbac';
import { logAudit } from '../../middleware/audit';
import { ReceivingService } from '../../services/receiving-service';
import {
  createReceivingSchema,
  updateReceivingLineSchema,
  createNonConformitySchema,
  completeReceivingSchema,
  listReceivingsQuerySchema,
  discrepancyReportQuerySchema,
} from './schemas';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

export async function receivingRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // ---------------------------------------------------------------------------
  // GET /receivings -- list receivings with filters
  // ---------------------------------------------------------------------------
  app.get('/', {
    preHandler: [requirePermission('receivings', 'read')],
    handler: async (request, reply) => {
      const filters = listReceivingsQuerySchema.parse(request.query);
      const result = await ReceivingService.list(
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

  // ---------------------------------------------------------------------------
  // POST /receivings -- create receiving for an order
  // ---------------------------------------------------------------------------
  app.post('/', {
    preHandler: [requirePermission('receivings', 'create')],
    handler: async (request, reply) => {
      const data = createReceivingSchema.parse(request.body);
      const receiving = await ReceivingService.create(
        app.db,
        request.user.tenantId,
        request.user.id,
        data.orderId,
      );

      await logAudit(app.db, request, {
        action: 'receiving.created',
        entityType: 'receiving',
        entityId: receiving.id,
        newValues: {
          orderId: data.orderId,
          linesCount: receiving.lines?.length || 0,
          status: 'in_progress',
        },
      });

      return reply.status(201).send({ success: true, data: receiving });
    },
  });

  // ---------------------------------------------------------------------------
  // GET /receivings/expected -- expected deliveries
  // ---------------------------------------------------------------------------
  app.get('/expected', {
    preHandler: [requirePermission('receivings', 'read')],
    handler: async (request, reply) => {
      const result = await ReceivingService.getExpectedDeliveries(
        app.db,
        request.user.tenantId,
      );

      return { success: true, data: result };
    },
  });

  // ---------------------------------------------------------------------------
  // GET /receivings/discrepancies -- discrepancy report
  // ---------------------------------------------------------------------------
  app.get('/discrepancies', {
    preHandler: [requirePermission('receivings', 'read')],
    handler: async (request, reply) => {
      const filters = discrepancyReportQuerySchema.parse(request.query);
      const result = await ReceivingService.getDiscrepancyReport(
        app.db,
        request.user.tenantId,
        filters,
      );

      return { success: true, data: result };
    },
  });

  // ---------------------------------------------------------------------------
  // GET /receivings/:id -- receiving detail
  // ---------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('receivings', 'read')],
    handler: async (request, reply) => {
      const receiving = await ReceivingService.getById(
        app.db,
        request.params.id,
      );

      if (!receiving) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Ricevimento non trovato',
          },
        });
      }

      return { success: true, data: receiving };
    },
  });

  // ---------------------------------------------------------------------------
  // PUT /receivings/:id/lines/:lineId -- update receiving line
  // ---------------------------------------------------------------------------
  app.put<{ Params: { id: string; lineId: string } }>(
    '/:id/lines/:lineId',
    {
      preHandler: [requirePermission('receivings', 'update')],
      handler: async (request, reply) => {
        const data = updateReceivingLineSchema.parse(request.body);
        const line = await ReceivingService.updateLine(
          app.db,
          request.params.lineId,
          data,
        );

        await logAudit(app.db, request, {
          action: 'receiving.line_updated',
          entityType: 'receiving',
          entityId: request.params.id,
          newValues: {
            lineId: request.params.lineId,
            quantityReceived: data.quantityReceived,
            isConforming: data.isConforming,
          },
        });

        return { success: true, data: line };
      },
    },
  );

  // ---------------------------------------------------------------------------
  // POST /receivings/:id/lines/:lineId/non-conformities
  // Add non-conformity with multipart photo upload
  // ---------------------------------------------------------------------------
  app.post<{ Params: { id: string; lineId: string } }>(
    '/:id/lines/:lineId/non-conformities',
    {
      preHandler: [requirePermission('receivings', 'update')],
      handler: async (request, reply) => {
        const receivingId = request.params.id;
        const lineId = request.params.lineId;

        // Process multipart form data
        const parts = request.parts();
        const photoPaths: string[] = [];
        let formData: Record<string, string> = {};

        // Ensure upload directory exists
        const uploadDir = join(UPLOAD_DIR, 'receivings', receivingId);
        await mkdir(uploadDir, { recursive: true });

        for await (const part of parts) {
          if (part.type === 'file') {
            // Save photo file
            const buffer = await part.toBuffer();
            const fileName = `${Date.now()}-${part.filename}`;
            const filePath = join(uploadDir, fileName);
            await writeFile(filePath, buffer);
            photoPaths.push(join('receivings', receivingId, fileName));
          } else {
            // Form field
            formData[part.fieldname] = part.value as string;
          }
        }

        // Parse and validate the non-conformity data from form fields
        const ncData = createNonConformitySchema.parse({
          type: formData.type,
          severity: formData.severity,
          description: formData.description,
        });

        const nc = await ReceivingService.addNonConformity(
          app.db,
          lineId,
          ncData,
          photoPaths,
        );

        await logAudit(app.db, request, {
          action: 'receiving.non_conformity_added',
          entityType: 'receiving',
          entityId: receivingId,
          newValues: {
            lineId,
            nonConformityId: nc.id,
            type: ncData.type,
            severity: ncData.severity,
            photoCount: photoPaths.length,
          },
        });

        return reply.status(201).send({ success: true, data: nc });
      },
    },
  );

  // ---------------------------------------------------------------------------
  // GET /receivings/:id/non-conformities -- list NCs for a receiving
  // ---------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/:id/non-conformities', {
    preHandler: [requirePermission('receivings', 'read')],
    handler: async (request, reply) => {
      const result = await ReceivingService.getNonConformities(
        app.db,
        request.params.id,
      );

      return { success: true, data: result };
    },
  });

  // ---------------------------------------------------------------------------
  // POST /receivings/:id/complete -- complete receiving with signature
  // ---------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/:id/complete', {
    preHandler: [requirePermission('receivings', 'update')],
    handler: async (request, reply) => {
      const data = completeReceivingSchema.parse(request.body);
      const result = await ReceivingService.complete(
        app.db,
        request.params.id,
        data.signatureData,
        request.user.id,
      );

      await logAudit(app.db, request, {
        action: 'receiving.completed',
        entityType: 'receiving',
        entityId: request.params.id,
        newValues: {
          status: 'completed',
          orderStatus: result.orderStatus,
          discrepancyCount: result.discrepancies.length,
          totalDiscrepancyAmount: result.totalDiscrepancyAmount,
        },
      });

      return { success: true, data: result };
    },
  });
}

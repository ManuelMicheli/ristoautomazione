import { FastifyInstance } from 'fastify';
import { UserRole } from '@cph/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireRole } from '../../middleware/rbac';
import { logAudit } from '../../middleware/audit';
import { InvoiceService } from '../../services/invoice-service';
import { ReconciliationService } from '../../services/reconciliation-service';
import { ocrQueue } from '../../jobs/queue';
import {
  listInvoicesQuerySchema,
  updateInvoiceSchema,
  contestInvoiceSchema,
  markPaidSchema,
  reconcileSchema,
  discrepancyReportQuerySchema,
  paymentScheduleQuerySchema,
} from './schemas';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

export async function invoiceRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // ---------------------------------------------------------------------------
  // POST /invoices/upload -- multipart file upload, create invoice, OCR job
  // ---------------------------------------------------------------------------
  app.post('/upload', {
    preHandler: [requirePermission('invoices', 'create')],
    handler: async (request, reply) => {
      const parts = request.parts();
      let filePath = '';
      let fileName = '';
      let mimeType = '';
      let supplierId = '';

      // Ensure upload directory exists
      const uploadDir = join(UPLOAD_DIR, 'invoices');
      await mkdir(uploadDir, { recursive: true });

      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          fileName = part.filename || `invoice-${Date.now()}`;
          mimeType = part.mimetype || 'application/octet-stream';
          const storedName = `${Date.now()}-${fileName}`;
          filePath = join(uploadDir, storedName);
          await writeFile(filePath, buffer);
          filePath = join('invoices', storedName); // Store relative path
        } else if (part.fieldname === 'supplierId') {
          supplierId = part.value as string;
        }
      }

      if (!filePath) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Nessun file caricato',
          },
        });
      }

      if (!supplierId) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Il fornitore (supplierId) e obbligatorio',
          },
        });
      }

      const invoice = await InvoiceService.upload(
        app.db,
        request.user.tenantId,
        supplierId,
        filePath,
        fileName,
        mimeType,
      );

      // Add OCR job to BullMQ queue
      await ocrQueue.add('extract-invoice', {
        invoiceId: invoice.id,
        filePath: join(UPLOAD_DIR, filePath),
        tenantId: request.user.tenantId,
      });

      await logAudit(app.db, request, {
        action: 'invoice.uploaded',
        entityType: 'invoice',
        entityId: invoice.id,
        newValues: {
          fileName,
          supplierId,
          status: 'pending_ocr',
        },
      });

      return reply.status(201).send({ success: true, data: invoice });
    },
  });

  // ---------------------------------------------------------------------------
  // GET /invoices -- list invoices with filters
  // ---------------------------------------------------------------------------
  app.get('/', {
    preHandler: [requirePermission('invoices', 'read')],
    handler: async (request, reply) => {
      const filters = listInvoicesQuerySchema.parse(request.query);
      const result = await InvoiceService.list(
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
  // GET /invoices/discrepancies -- discrepancy report
  // ---------------------------------------------------------------------------
  app.get('/discrepancies', {
    preHandler: [requirePermission('invoices', 'read')],
    handler: async (request, reply) => {
      const filters = discrepancyReportQuerySchema.parse(request.query);
      const result = await InvoiceService.getDiscrepancyReport(
        app.db,
        request.user.tenantId,
        filters.period,
        filters.supplierId,
      );

      return { success: true, data: result };
    },
  });

  // ---------------------------------------------------------------------------
  // GET /invoices/payment-schedule -- upcoming payments by week
  // ---------------------------------------------------------------------------
  app.get('/payment-schedule', {
    preHandler: [requirePermission('invoices', 'read')],
    handler: async (request, reply) => {
      const filters = paymentScheduleQuerySchema.parse(request.query);
      const result = await InvoiceService.getPaymentSchedule(
        app.db,
        request.user.tenantId,
        filters.weeksAhead,
      );

      return { success: true, data: result };
    },
  });

  // ---------------------------------------------------------------------------
  // GET /invoices/:id -- invoice detail
  // ---------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('invoices', 'read')],
    handler: async (request, reply) => {
      const invoice = await InvoiceService.getById(
        app.db,
        request.params.id,
      );

      if (!invoice) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Fattura non trovata',
          },
        });
      }

      return { success: true, data: invoice };
    },
  });

  // ---------------------------------------------------------------------------
  // PUT /invoices/:id -- update extracted data
  // ---------------------------------------------------------------------------
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('invoices', 'update')],
    handler: async (request, reply) => {
      const data = updateInvoiceSchema.parse(request.body);
      const invoice = await InvoiceService.update(
        app.db,
        request.params.id,
        data,
      );

      await logAudit(app.db, request, {
        action: 'invoice.updated',
        entityType: 'invoice',
        entityId: request.params.id,
        newValues: data as Record<string, unknown>,
      });

      return { success: true, data: invoice };
    },
  });

  // ---------------------------------------------------------------------------
  // POST /invoices/:id/verify -- mark as verified
  // ---------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/:id/verify', {
    preHandler: [requirePermission('invoices', 'update')],
    handler: async (request, reply) => {
      const invoice = await InvoiceService.verify(
        app.db,
        request.params.id,
        request.user.id,
      );

      await logAudit(app.db, request, {
        action: 'invoice.verified',
        entityType: 'invoice',
        entityId: request.params.id,
        oldValues: { status: 'pending_review' },
        newValues: {
          status: 'verified',
          verifiedBy: request.user.id,
        },
      });

      return { success: true, data: invoice };
    },
  });

  // ---------------------------------------------------------------------------
  // POST /invoices/:id/contest -- contest invoice
  // ---------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/:id/contest', {
    preHandler: [requirePermission('invoices', 'update')],
    handler: async (request, reply) => {
      const data = contestInvoiceSchema.parse(request.body);
      const invoice = await InvoiceService.contest(
        app.db,
        request.params.id,
        data.notes,
      );

      await logAudit(app.db, request, {
        action: 'invoice.contested',
        entityType: 'invoice',
        entityId: request.params.id,
        newValues: {
          status: 'contested',
          notes: data.notes,
        },
      });

      return { success: true, data: invoice };
    },
  });

  // ---------------------------------------------------------------------------
  // POST /invoices/:id/approve-payment -- approve for payment
  // ---------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/:id/approve-payment', {
    preHandler: [
      requireRole(UserRole.Owner, UserRole.Accountant),
    ],
    handler: async (request, reply) => {
      const invoice = await InvoiceService.approvePayment(
        app.db,
        request.params.id,
      );

      await logAudit(app.db, request, {
        action: 'invoice.payment_approved',
        entityType: 'invoice',
        entityId: request.params.id,
        oldValues: { status: 'verified' },
        newValues: { status: 'approved' },
      });

      return { success: true, data: invoice };
    },
  });

  // ---------------------------------------------------------------------------
  // POST /invoices/:id/mark-paid -- mark as paid
  // ---------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/:id/mark-paid', {
    preHandler: [
      requireRole(UserRole.Owner, UserRole.Accountant),
    ],
    handler: async (request, reply) => {
      const data = markPaidSchema.parse(request.body);
      const invoice = await InvoiceService.markPaid(
        app.db,
        request.params.id,
        data.paymentReference,
      );

      await logAudit(app.db, request, {
        action: 'invoice.marked_paid',
        entityType: 'invoice',
        entityId: request.params.id,
        oldValues: { status: 'approved' },
        newValues: {
          status: 'paid',
          paymentReference: data.paymentReference,
        },
      });

      return { success: true, data: invoice };
    },
  });

  // ---------------------------------------------------------------------------
  // POST /invoices/:id/reconcile -- run three-way matching
  // ---------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/:id/reconcile', {
    preHandler: [requirePermission('invoices', 'update')],
    handler: async (request, reply) => {
      const data = reconcileSchema.parse(request.body || {});
      const result = await ReconciliationService.reconcile(
        app.db,
        request.params.id,
        data.orderId,
        data.receivingId,
      );

      await logAudit(app.db, request, {
        action: 'invoice.reconciled',
        entityType: 'invoice',
        entityId: request.params.id,
        newValues: {
          reconciliationId: result.id,
          status: result.status,
          discrepancyAmount: result.discrepancyAmount,
          discrepancyCount: result.summary?.discrepancyCount || 0,
        },
      });

      return { success: true, data: result };
    },
  });

  // ---------------------------------------------------------------------------
  // GET /invoices/:id/reconciliation -- get reconciliation results
  // ---------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/:id/reconciliation', {
    preHandler: [requirePermission('invoices', 'read')],
    handler: async (request, reply) => {
      const reconciliation = await ReconciliationService.getByInvoiceId(
        app.db,
        request.params.id,
      );

      if (!reconciliation) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Nessuna riconciliazione trovata per questa fattura',
          },
        });
      }

      return { success: true, data: reconciliation };
    },
  });
}

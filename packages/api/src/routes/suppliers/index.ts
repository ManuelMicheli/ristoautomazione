import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/rbac';
import { logAudit } from '../../middleware/audit';
import { SupplierService } from '../../services/supplier-service';
import { scoringRoutes } from './scoring';
import {
  createSupplierSchema,
  updateSupplierSchema,
  createSupplierContactSchema,
  updateContactSchema,
  listSuppliersQuerySchema,
} from './schemas';

export async function supplierRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  const service = new SupplierService();

  // =========================================================================
  // SCORING ROUTES (registered first — static paths before :id params)
  // =========================================================================
  await app.register(scoringRoutes);

  // -------------------------------------------------------------------------
  // GET /suppliers — list with pagination, search, filter, sort
  // -------------------------------------------------------------------------
  app.get(
    '/',
    {
      preHandler: [requirePermission('suppliers', 'read')],
    },
    async (request, reply) => {
      const query = listSuppliersQuerySchema.parse(request.query);
      const result = await service.list(app.db, request.user.tenantId, query);
      return {
        success: true,
        data: result.data,
        pagination: result.pagination,
      };
    },
  );

  // -------------------------------------------------------------------------
  // POST /suppliers — create with contacts
  // -------------------------------------------------------------------------
  app.post(
    '/',
    {
      preHandler: [requirePermission('suppliers', 'create')],
    },
    async (request, reply) => {
      const body = createSupplierSchema.parse(request.body);
      const supplier = await service.create(
        app.db,
        request.user.tenantId,
        body,
      );
      await logAudit(app.db, request, {
        action: 'CREATE',
        entityType: 'supplier',
        entityId: supplier!.id,
        newValues: body as any,
      });
      return reply.status(201).send({ success: true, data: supplier });
    },
  );

  // -------------------------------------------------------------------------
  // GET /suppliers/categories — list categories with counts
  // -------------------------------------------------------------------------
  app.get(
    '/categories',
    {
      preHandler: [requirePermission('suppliers', 'read')],
    },
    async (request) => {
      const categories = await service.getCategories(
        app.db,
        request.user.tenantId,
      );
      return { success: true, data: categories };
    },
  );

  // -------------------------------------------------------------------------
  // GET /suppliers/risk-map — categories with supplier count and risk level
  // -------------------------------------------------------------------------
  app.get(
    '/risk-map',
    {
      preHandler: [requirePermission('suppliers', 'read')],
    },
    async (request) => {
      const riskMap = await service.getRiskMap(
        app.db,
        request.user.tenantId,
      );
      return { success: true, data: riskMap };
    },
  );

  // -------------------------------------------------------------------------
  // GET /suppliers/:id — full detail
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: [requirePermission('suppliers', 'read')],
    },
    async (request, reply) => {
      const supplier = await service.getById(
        app.db,
        request.user.tenantId,
        request.params.id,
      );
      if (!supplier) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Fornitore non trovato',
          },
        });
      }
      return { success: true, data: supplier };
    },
  );

  // -------------------------------------------------------------------------
  // PUT /suppliers/:id — update
  // -------------------------------------------------------------------------
  app.put<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: [requirePermission('suppliers', 'update')],
    },
    async (request, reply) => {
      const body = updateSupplierSchema.parse(request.body);
      const old = await service.getById(
        app.db,
        request.user.tenantId,
        request.params.id,
      );
      if (!old) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Fornitore non trovato',
          },
        });
      }
      const updated = await service.update(
        app.db,
        request.user.tenantId,
        request.params.id,
        body,
      );
      await logAudit(app.db, request, {
        action: 'UPDATE',
        entityType: 'supplier',
        entityId: request.params.id,
        oldValues: old as any,
        newValues: body as any,
      });
      return { success: true, data: updated };
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /suppliers/:id — soft delete
  // -------------------------------------------------------------------------
  app.delete<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: [requirePermission('suppliers', 'delete')],
    },
    async (request, reply) => {
      const existing = await service.getById(
        app.db,
        request.user.tenantId,
        request.params.id,
      );
      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Fornitore non trovato',
          },
        });
      }
      await service.softDelete(
        app.db,
        request.user.tenantId,
        request.params.id,
      );
      await logAudit(app.db, request, {
        action: 'DELETE',
        entityType: 'supplier',
        entityId: request.params.id,
      });
      return { success: true, data: { message: 'Fornitore eliminato' } };
    },
  );

  // =========================================================================
  // CONTACTS
  // =========================================================================

  // -------------------------------------------------------------------------
  // GET /suppliers/:id/contacts
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    '/:id/contacts',
    {
      preHandler: [requirePermission('suppliers', 'read')],
    },
    async (request) => {
      const contacts = await service.listContacts(
        app.db,
        request.params.id,
      );
      return { success: true, data: contacts };
    },
  );

  // -------------------------------------------------------------------------
  // POST /suppliers/:id/contacts
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>(
    '/:id/contacts',
    {
      preHandler: [requirePermission('suppliers', 'create')],
    },
    async (request, reply) => {
      const body = createSupplierContactSchema.parse(request.body);
      const contact = await service.createContact(
        app.db,
        request.params.id,
        body,
      );
      await logAudit(app.db, request, {
        action: 'CREATE',
        entityType: 'supplier_contact',
        entityId: contact!.id,
        newValues: body as any,
      });
      return reply.status(201).send({ success: true, data: contact });
    },
  );

  // -------------------------------------------------------------------------
  // PUT /suppliers/:id/contacts/:contactId
  // -------------------------------------------------------------------------
  app.put<{ Params: { id: string; contactId: string } }>(
    '/:id/contacts/:contactId',
    {
      preHandler: [requirePermission('suppliers', 'update')],
    },
    async (request) => {
      const body = updateContactSchema.parse(request.body);
      const contact = await service.updateContact(
        app.db,
        request.params.contactId,
        body,
      );
      if (!contact) {
        throw { statusCode: 404, message: 'Contatto non trovato' };
      }
      return { success: true, data: contact };
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /suppliers/:id/contacts/:contactId
  // -------------------------------------------------------------------------
  app.delete<{ Params: { id: string; contactId: string } }>(
    '/:id/contacts/:contactId',
    {
      preHandler: [requirePermission('suppliers', 'delete')],
    },
    async (request) => {
      await service.deleteContact(app.db, request.params.contactId);
      return { success: true, data: { message: 'Contatto eliminato' } };
    },
  );

  // =========================================================================
  // DOCUMENTS
  // =========================================================================

  // -------------------------------------------------------------------------
  // GET /suppliers/:id/documents
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    '/:id/documents',
    {
      preHandler: [requirePermission('suppliers', 'read')],
    },
    async (request) => {
      const docs = await service.listDocuments(app.db, request.params.id);
      return { success: true, data: docs };
    },
  );

  // -------------------------------------------------------------------------
  // POST /suppliers/:id/documents — file upload
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>(
    '/:id/documents',
    {
      preHandler: [requirePermission('suppliers', 'create')],
    },
    async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'NO_FILE',
            message: 'Nessun file caricato',
          },
        });
      }

      const fs = await import('fs/promises');
      const path = await import('path');
      const { randomUUID } = await import('crypto');

      const uploadDir = path.join(
        process.env.UPLOAD_DIR || './uploads',
        'suppliers',
        request.params.id,
      );
      await fs.mkdir(uploadDir, { recursive: true });

      const ext = path.extname(data.filename);
      const savedName = `${randomUUID()}${ext}`;
      const filePath = path.join(uploadDir, savedName);

      const buffer = await data.toBuffer();
      await fs.writeFile(filePath, buffer);

      // Get fields from multipart
      const fields = data.fields as Record<string, any>;
      const docType = fields.type?.value || 'other';
      const expiryDate = fields.expiryDate?.value || null;

      const doc = await service.createDocument(
        app.db,
        request.params.id,
        {
          type: docType,
          filePath: filePath,
          fileName: data.filename,
          mimeType: data.mimetype,
          expiryDate: expiryDate,
          uploadedBy: request.user.id,
        },
      );

      await logAudit(app.db, request, {
        action: 'CREATE',
        entityType: 'supplier_document',
        entityId: doc!.id,
        newValues: {
          type: docType,
          fileName: data.filename,
          mimeType: data.mimetype,
        },
      });

      return reply.status(201).send({ success: true, data: doc });
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /suppliers/:id/documents/:docId
  // -------------------------------------------------------------------------
  app.delete<{ Params: { id: string; docId: string } }>(
    '/:id/documents/:docId',
    {
      preHandler: [requirePermission('suppliers', 'delete')],
    },
    async (request) => {
      await service.deleteDocument(app.db, request.params.docId);
      await logAudit(app.db, request, {
        action: 'DELETE',
        entityType: 'supplier_document',
        entityId: request.params.docId,
      });
      return { success: true, data: { message: 'Documento eliminato' } };
    },
  );

  // =========================================================================
  // HISTORY
  // =========================================================================

  // -------------------------------------------------------------------------
  // GET /suppliers/:id/history
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    '/:id/history',
    {
      preHandler: [requirePermission('suppliers', 'read')],
    },
    async (request) => {
      const query = request.query as any;
      const page = parseInt(query.page || '1', 10);
      const pageSize = parseInt(query.pageSize || '20', 10);
      const history = await service.getHistory(
        app.db,
        request.params.id,
        page,
        pageSize,
      );
      return {
        success: true,
        data: history.data,
        pagination: history.pagination,
      };
    },
  );
}

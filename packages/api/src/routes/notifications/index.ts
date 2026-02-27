import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { NotificationService } from '../../services/notification-service';

// ---------------------------------------------------------------------------
// Query / Param Schemas
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  type: z.string().optional(),
  isRead: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

const markReadParamsSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // -------------------------------------------------------------------------
  // GET /notifications -- list user's notifications (paginated, filtered)
  // -------------------------------------------------------------------------
  app.get('/', async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const userId = request.user.id;

    const result = await NotificationService.list(app.db, userId, {
      type: query.type,
      isRead: query.isRead,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      success: true,
      data: result.data,
      pagination: result.pagination,
    };
  });

  // -------------------------------------------------------------------------
  // GET /notifications/unread-count -- polled by frontend badge
  // -------------------------------------------------------------------------
  app.get('/unread-count', async (request, reply) => {
    const userId = request.user.id;
    const count = await NotificationService.getUnreadCount(app.db, userId);
    return { success: true, data: { count } };
  });

  // -------------------------------------------------------------------------
  // PUT /notifications/read-all -- mark all as read for user
  // Note: registered BEFORE /:id/read to avoid route collision
  // -------------------------------------------------------------------------
  app.put('/read-all', async (request, reply) => {
    const userId = request.user.id;
    const result = await NotificationService.markAllRead(app.db, userId);
    return { success: true, data: result };
  });

  // -------------------------------------------------------------------------
  // PUT /notifications/:id/read -- mark single notification as read
  // -------------------------------------------------------------------------
  app.put<{ Params: { id: string } }>(
    '/:id/read',
    async (request, reply) => {
      const { id } = markReadParamsSchema.parse(request.params);
      const userId = request.user.id;

      const notification = await NotificationService.markRead(
        app.db,
        id,
        userId,
      );

      if (!notification) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Notifica non trovata',
          },
        });
      }

      return { success: true, data: notification };
    },
  );
}

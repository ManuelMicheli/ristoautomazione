import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireRole } from '../../middleware/rbac';
import { ScoringService } from '../../services/scoring-service';

// ---------------------------------------------------------------------------
// Query / Param Schemas
// ---------------------------------------------------------------------------

const scoreParamsSchema = z.object({
  id: z.string().uuid(),
});

const rankingQuerySchema = z.object({
  category: z.string().optional(),
  sortBy: z
    .enum([
      'composite',
      'punctuality',
      'conformity',
      'priceCompetitiveness',
      'reliability',
    ])
    .optional()
    .default('composite'),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function scoringRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // -------------------------------------------------------------------------
  // GET /suppliers/ranking -- ranked list of all suppliers with scores
  // -------------------------------------------------------------------------
  app.get(
    '/ranking',
    {
      preHandler: [requirePermission('suppliers', 'read')],
    },
    async (request, reply) => {
      const query = rankingQuerySchema.parse(request.query);
      const tenantId = request.user.tenantId;

      const sortByValue =
        query.sortBy === 'composite' ? undefined : query.sortBy;

      const ranking = await ScoringService.getRanking(
        app.db,
        tenantId,
        query.category,
        sortByValue,
      );

      return { success: true, data: ranking };
    },
  );

  // -------------------------------------------------------------------------
  // POST /suppliers/recalculate-scores -- trigger recalculation (Owner only)
  // -------------------------------------------------------------------------
  app.post(
    '/recalculate-scores',
    {
      preHandler: [requireRole('owner')],
    },
    async (request, reply) => {
      const tenantId = request.user.tenantId;

      const result = await ScoringService.recalculateAll(app.db, tenantId);

      return {
        success: true,
        data: {
          message: `Punteggi ricalcolati per ${result.suppliersProcessed} fornitori`,
          suppliersProcessed: result.suppliersProcessed,
          results: result.results,
        },
      };
    },
  );

  // -------------------------------------------------------------------------
  // GET /suppliers/:id/score -- detailed score breakdown for a supplier
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    '/:id/score',
    {
      preHandler: [requirePermission('suppliers', 'read')],
    },
    async (request, reply) => {
      const { id } = scoreParamsSchema.parse(request.params);

      const score = await ScoringService.getScore(app.db, id);

      if (!score) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Fornitore non trovato',
          },
        });
      }

      return { success: true, data: score };
    },
  );
}

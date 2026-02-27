import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as argon2 from 'argon2';
import { eq, and, isNull } from 'drizzle-orm';
import { users } from '@cph/db';
import { authenticate } from '../../middleware/authenticate';

const loginSchema = z.object({
  email: z.string().email('Email non valida'),
  password: z.string().min(1, 'Password obbligatoria'),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const [user] = await app.db
      .select()
      .from(users)
      .where(and(eq(users.email, body.email), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email o password non corretti',
        },
      });
    }

    if (!user.isActive) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'ACCOUNT_DISABLED',
          message: 'Account disabilitato',
        },
      });
    }

    const validPassword = await argon2.verify(user.passwordHash, body.password);
    if (!validPassword) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email o password non corretti',
        },
      });
    }

    const payload = {
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    };
    const accessToken = app.jwt.sign(payload, { expiresIn: '15m' });
    const refreshToken = app.jwt.sign(payload, { expiresIn: '7d' });

    // Store refresh token in Redis
    await app.redis.set(
      `refresh:${user.id}`,
      refreshToken,
      'EX',
      7 * 24 * 60 * 60,
    );

    return {
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          tenantId: user.tenantId,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      },
    };
  });

  // POST /auth/refresh
  app.post('/refresh', async (request, reply) => {
    const body = refreshSchema.parse(request.body);

    try {
      const decoded = app.jwt.verify<{
        id: string;
        tenantId: string;
        role: string;
        email: string;
      }>(body.refreshToken);
      const storedToken = await app.redis.get(`refresh:${decoded.id}`);

      if (storedToken !== body.refreshToken) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Refresh token non valido',
          },
        });
      }

      const payload = {
        id: decoded.id,
        tenantId: decoded.tenantId,
        role: decoded.role,
        email: decoded.email,
      };
      const accessToken = app.jwt.sign(payload, { expiresIn: '15m' });
      const refreshToken = app.jwt.sign(payload, { expiresIn: '7d' });

      await app.redis.set(
        `refresh:${decoded.id}`,
        refreshToken,
        'EX',
        7 * 24 * 60 * 60,
      );

      return { success: true, data: { accessToken, refreshToken } };
    } catch {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Refresh token scaduto o non valido',
        },
      });
    }
  });

  // POST /auth/logout
  app.post(
    '/logout',
    { preHandler: [authenticate] },
    async (request) => {
      await app.redis.del(`refresh:${request.user.id}`);
      return { success: true, data: { message: 'Logout effettuato' } };
    },
  );

  // GET /auth/me
  app.get(
    '/me',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const [user] = await app.db
        .select({
          id: users.id,
          tenantId: users.tenantId,
          email: users.email,
          role: users.role,
          firstName: users.firstName,
          lastName: users.lastName,
          locationId: users.locationId,
        })
        .from(users)
        .where(eq(users.id, request.user.id))
        .limit(1);

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Utente non trovato' },
        });
      }

      return { success: true, data: user };
    },
  );
}

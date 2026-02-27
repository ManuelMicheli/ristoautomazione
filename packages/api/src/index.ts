import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../.env') });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import fastifyJwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { databasePlugin } from './plugins/database';
import { redisPlugin } from './plugins/redis';
import { errorHandler } from './middleware/error-handler';
import { authRoutes } from './routes/auth';
import { supplierRoutes } from './routes/suppliers';
import { productRoutes } from './routes/products';
import { orderRoutes } from './routes/orders';
import { receivingRoutes } from './routes/receivings';
import { invoiceRoutes } from './routes/invoices';
import { analyticsRoutes } from './routes/analytics';
import { notificationRoutes } from './routes/notifications';
import { shoppingListRoutes } from './routes/shopping-list';

const envToLogger: Record<string, any> = {
  development: {
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
    },
  },
  production: true,
};

async function buildApp() {
  const app = Fastify({
    logger: envToLogger[process.env.NODE_ENV || 'development'] || true,
  });

  // Global error handler
  app.setErrorHandler(errorHandler);

  // Plugins
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });
  await app.register(helmet);
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB
  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
  });
  await app.register(cookie);
  await app.register(databasePlugin);
  await app.register(redisPlugin);

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  }));

  // API routes
  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(supplierRoutes, { prefix: '/suppliers' });
      await api.register(productRoutes, { prefix: '/products' });
      await api.register(orderRoutes, { prefix: '/orders' });
      await api.register(receivingRoutes, { prefix: '/receivings' });
      await api.register(invoiceRoutes, { prefix: '/invoices' });
      await api.register(analyticsRoutes, { prefix: '/analytics' });
      await api.register(notificationRoutes, { prefix: '/notifications' });
      await api.register(shoppingListRoutes, { prefix: '/shopping-list' });
    },
    { prefix: '/api/v1' },
  );

  return app;
}

async function start() {
  const app = await buildApp();
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    app.log.info(`Server running on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only start the server when running directly (not when imported as a module)
if (process.env.VERCEL !== '1') {
  start();
}

export { buildApp };

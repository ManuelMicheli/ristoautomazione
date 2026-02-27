import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@cph/db';

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof drizzle>;
  }
}

export const databasePlugin = fp(async (app: FastifyInstance) => {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://cph:cph@localhost:5432/cph',
  });

  const db = drizzle(pool, { schema });
  app.decorate('db', db);

  app.addHook('onClose', async () => {
    await pool.end();
  });
});

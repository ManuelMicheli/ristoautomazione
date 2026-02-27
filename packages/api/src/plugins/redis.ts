import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';

// In-memory fallback when Redis is not available
class InMemoryRedis {
  private store = new Map<string, { value: string; expiry?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ...args: any[]): Promise<'OK'> {
    let expiry: number | undefined;
    if (args[0] === 'EX' && typeof args[1] === 'number') {
      expiry = Date.now() + args[1] * 1000;
    }
    this.store.set(key, { value, expiry });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
    }
    return count;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.store.keys()).filter((k) => regex.test(k));
  }

  disconnect() {}
}

declare module 'fastify' {
  interface FastifyInstance {
    redis: InMemoryRedis;
  }
}

export const redisPlugin = fp(async (app: FastifyInstance) => {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    // Dynamic import to avoid loading ioredis when not needed
    try {
      const ioredisModule = await import('ioredis');
      const Redis = ioredisModule.default ?? ioredisModule;
      const ioRedis = new (Redis as any)(redisUrl, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        connectTimeout: 3000,
        lazyConnect: true,
      });
      ioRedis.on('error', () => {});
      await ioRedis.connect();
      app.decorate('redis', ioRedis as any);
      app.log.info('Connected to Redis');
      app.addHook('onClose', async () => { ioRedis.disconnect(); });
      return;
    } catch {
      app.log.warn('Redis not available — using in-memory fallback');
    }
  } else {
    app.log.warn('REDIS_URL not set — using in-memory fallback');
  }

  const redis = new InMemoryRedis();
  app.decorate('redis', redis);
  app.addHook('onClose', async () => { redis.disconnect(); });
});

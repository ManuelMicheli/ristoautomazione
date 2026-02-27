import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';

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
    redis: Redis | InMemoryRedis;
  }
}

export const redisPlugin = fp(async (app: FastifyInstance) => {
  let redis: Redis | InMemoryRedis;

  try {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    await (redis as Redis).connect();
    app.log.info('Connected to Redis');
  } catch {
    app.log.warn('Redis not available — using in-memory fallback');
    redis = new InMemoryRedis();
  }

  app.decorate('redis', redis as any);

  app.addHook('onClose', async () => {
    redis.disconnect();
  });
});

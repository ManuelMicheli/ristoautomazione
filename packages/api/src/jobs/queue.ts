import { Queue } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  { maxRetriesPerRequest: null },
);

export const ocrQueue = new Queue('ocr', { connection });
export const emailQueue = new Queue('email', { connection });
export const scoringQueue = new Queue('scoring', { connection });
export const reportQueue = new Queue('report', { connection });

export { connection as redisConnection };

import { Queue } from 'bullmq';

function getConnection() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  // Dynamic require to avoid loading ioredis when Redis not configured
  const Redis = require('ioredis').default || require('ioredis');
  return new Redis(url, { maxRetriesPerRequest: null });
}

const connection = getConnection();

// Queues are no-ops when Redis is not available
const noopQueue = { add: async () => ({}) } as any;

export const ocrQueue = connection ? new Queue('ocr', { connection }) : noopQueue;
export const emailQueue = connection ? new Queue('email', { connection }) : noopQueue;
export const scoringQueue = connection ? new Queue('scoring', { connection }) : noopQueue;
export const reportQueue = connection ? new Queue('report', { connection }) : noopQueue;

export { connection as redisConnection };
